import {registerCustomerSale} from './customer-sale';
import 'server-only';
import { z } from 'zod';
import { withTransaction } from '@/lib/db';
import { assertBranchAccess, getAuthorizedBranchIds } from '@/lib/auth/authorization';
import { requireSystemRegistration } from '@/lib/auth/special-permissions';
import type { SessionUser } from '@/lib/auth/types';
import { receivingAction } from './receiving';
import { registerPos } from './receptions';
import { registerExitPos } from './exits';
import { registerReturnPos } from './returns';
import { registerTransferPos } from './transfers';

export const registrationSchema = z.object({ id: z.string().uuid(), kind: z.enum(['RECEIVING','DESTINATION','RECEPTION','EXIT','RETURN_ML','RETURN_TIKTOK','RETURN_CUSTOMER','TRANSFER','CLIENT_SALE']), side: z.enum(['origin','destination']).nullable().default(null) });
export type RegistrationKey = z.infer<typeof registrationSchema>;
export type RegistrationPending = RegistrationKey & { reference: string; branch_id: string; branch: string; created_at: string; correction: boolean };

// One row per registration responsibility. A transfer can legitimately have two
// pending sides, never two confirmations for the same side.
export const pendingSql = `WITH pending AS (
    SELECT s.id,'RECEIVING'::text kind,NULL::text side,s.reference,s.branch_id,s.created_at,false correction
    FROM receiving_sessions s WHERE s.status='CLOSED'
    UNION ALL
    SELECT o.id,'DESTINATION',NULL::text,o.reference,o.destination_branch_id,min(a.received_at),bool_or(r.carton_id IS NOT NULL)
    FROM receiving_orders o JOIN receiving_cartons b ON b.order_id=o.id JOIN receiving_destination_arrivals a ON a.carton_id=b.id AND a.branch_id=o.destination_branch_id
    LEFT JOIN receiving_destination_registrations r ON r.carton_id=b.id
    WHERE o.voided_at IS NULL AND (r.carton_id IS NULL OR r.counted_at IS DISTINCT FROM b.counted_at)
    GROUP BY o.id HAVING count(*) FILTER(WHERE b.counted_at IS NULL)=0
    UNION ALL
    SELECT m.id,m.movement_type::text,NULL::text,m.folio,m.branch_id,COALESCE(m.closed_at,m.created_at),m.status::text='POS_CORRECTION_PENDING'
    FROM inventory_movements m WHERE m.movement_type::text IN ('RECEPTION','EXIT','RETURN_ML','RETURN_TIKTOK','RETURN_CUSTOMER')
      AND ((m.status::text IN ('CLOSED','PENDING_POS') AND m.pos_registered_at IS NULL) OR m.status::text='POS_CORRECTION_PENDING')
    UNION ALL
    SELECT m.id,'TRANSFER','origin',m.folio,t.origin_branch_id,COALESCE(t.sent_at,m.created_at),false
    FROM transfers t JOIN inventory_movements m ON m.id=t.movement_id WHERE NOT t.customer_sale AND t.status::text='PENDING_POS' AND t.origin_pos_registered_at IS NULL
    UNION ALL
    SELECT m.id,'TRANSFER','destination',m.folio,t.destination_branch_id,COALESCE(t.received_at,m.created_at),false
    FROM transfers t JOIN inventory_movements m ON m.id=t.movement_id JOIN branches b ON b.id=t.destination_branch_id
    WHERE NOT t.customer_sale AND t.status::text='PENDING_POS' AND t.destination_pos_registered_at IS NULL AND b.name IN ('Treviño','Plaza del Audio')
    UNION ALL
    SELECT m.id,'CLIENT_SALE','origin',m.folio,t.origin_branch_id,t.paid_at,false
    FROM transfers t JOIN inventory_movements m ON m.id=t.movement_id
    WHERE t.customer_sale AND t.paid_at IS NOT NULL AND t.sent_at IS NOT NULL AND t.origin_pos_registered_at IS NULL AND t.status::text IN ('WAITING_RECEIPT','PENDING_POS')
) SELECT p.id::text,p.kind,p.side,p.reference,p.branch_id::text,b.name branch,p.created_at::text,p.correction
  FROM pending p JOIN branches b ON b.id=p.branch_id
  WHERE ($1::uuid[] IS NULL OR p.branch_id=ANY($1::uuid[])) ORDER BY p.created_at,p.id,p.side LIMIT 500`;

export async function registrationPending(user: SessionUser): Promise<RegistrationPending[]> {
    await requireSystemRegistration(user);
    const branches = await getAuthorizedBranchIds(user);
    return withTransaction(async c => (await c.query(pendingSql, [branches])).rows);
}
export async function registrationHistory(user: SessionUser) {
    await requireSystemRegistration(user);
    const branches = await getAuthorizedBranchIds(user);
    return withTransaction(async c => (await c.query(`SELECT a.id::text,a.action,a.created_at::text,u.name actor,b.name branch,
        COALESCE(m.folio,s.reference,o.reference,'Registro') reference
        FROM audit_events a JOIN users u ON u.id=a.user_id LEFT JOIN branches b ON b.id=a.branch_id
        LEFT JOIN inventory_movements m ON m.id=a.movement_id
        LEFT JOIN receiving_sessions s ON s.id=CASE WHEN a.action='RECEIVING_POS_REGISTERED' THEN (a.new_value->>'sessionId')::uuid END
        LEFT JOIN receiving_orders o ON o.id=CASE WHEN a.action='RECEIVING_DESTINATION_POS_REGISTERED' THEN (a.new_value->>'orderId')::uuid END
        WHERE a.action=ANY($2::text[]) AND ($1::uuid[] IS NULL OR a.branch_id=ANY($1::uuid[]))
        ORDER BY a.created_at DESC,a.id DESC LIMIT 100`, [branches, ['RECEIVING_POS_REGISTERED','RECEIVING_DESTINATION_POS_REGISTERED','POS_REGISTERED','POS_CORRECTION_REGISTERED','EXIT_POS_REGISTERED','EXIT_POS_CORRECTION_REGISTERED','RETURN_POS_REGISTERED','RETURN_POS_CORRECTION_REGISTERED','TRANSFER_ORIGIN_POS','TRANSFER_DESTINATION_POS','CUSTOMER_SALE_REGISTERED']])).rows);
}
export async function registrationDetail(user: SessionUser, raw: unknown) {
    await requireSystemRegistration(user);
    const key = registrationSchema.parse(raw);
    // Reuse the scoped queue: no draft, archived, foreign-only or reconciled
    // records can be turned into a pending confirmation by a supplied ID.
    const row = (await registrationPending(user)).find(p => p.id === key.id && p.kind === key.kind && p.side === key.side);
    if (!row) throw new Error('El registro ya no está pendiente o no tienes acceso a esa sucursal.');
    await assertBranchAccess(user, row.branch_id);
    const lines = await withTransaction(async c => {
        if (key.kind === 'DESTINATION') return (await c.query(`SELECT COALESCE(p.name,o.product_label) product,b.carton_number box,l.model,l.color,l.counted quantity FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id JOIN receiving_destination_arrivals a ON a.carton_id=b.id AND a.branch_id=o.destination_branch_id LEFT JOIN receiving_destination_registrations r ON r.carton_id=b.id LEFT JOIN products p ON p.id=o.product_id JOIN receiving_items l ON l.carton_id=b.id WHERE o.id=$1 AND (r.carton_id IS NULL OR r.counted_at IS DISTINCT FROM b.counted_at) ORDER BY b.carton_number,l.model,l.color`,[key.id])).rows;
        if (key.kind === 'RECEIVING') return (await c.query(`SELECT COALESCE(p.name,o.product_label) product,b.carton_number box,l.model,l.color,l.counted quantity FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id LEFT JOIN products p ON p.id=o.product_id JOIN receiving_items l ON l.carton_id=b.id WHERE b.session_id=$1 AND NOT o.is_foreign ORDER BY p.name,b.carton_number,l.model,l.color`, [key.id])).rows;
        if (key.kind === 'RECEPTION') return (await c.query(`SELECT p.name product,b.box_number::text box,l.model_reference model,c.name color,l.quantity FROM reception_box_lines l JOIN reception_boxes b ON b.id=l.box_id JOIN receptions r ON r.id=b.reception_id JOIN products p ON p.id=l.product_id LEFT JOIN product_colors c ON c.id=l.color_id WHERE r.movement_id=$1 ORDER BY b.box_number,l.model_reference,c.name`, [key.id])).rows;
        if (key.kind === 'EXIT') return (await c.query('SELECT p.name product,l.quantity FROM exit_lines l JOIN products p ON p.id=l.product_id WHERE l.movement_id=$1 ORDER BY p.name,l.id', [key.id])).rows;
        if (key.kind === 'TRANSFER'||key.kind==='CLIENT_SALE') return (await c.query(`SELECT p.name product,CASE WHEN $2='destination' THEN l.received_quantity ELSE l.sent_quantity END quantity FROM transfer_lines l JOIN transfers t ON t.id=l.transfer_id JOIN products p ON p.id=l.product_id WHERE t.movement_id=$1 ORDER BY p.name,l.id`, [key.id,key.side])).rows;
        return (await c.query('SELECT p.name product,l.model_reference model,c.name color,l.quantity,l.condition::text condition FROM return_lines l JOIN products p ON p.id=l.product_id LEFT JOIN product_colors c ON c.id=l.color_id WHERE l.movement_id=$1 ORDER BY p.name,l.model_reference,c.name', [key.id])).rows;
    });
    return { row, lines };
}
export async function confirmRegistration(user: SessionUser, raw: unknown) {
    await requireSystemRegistration(user);
    const key = registrationSchema.parse(raw);
    const { row } = await registrationDetail(user, key);
    await assertBranchAccess(user, row.branch_id);
    if(key.kind==='CLIENT_SALE'){await registerCustomerSale(user,key.id);return;}
    if (key.kind !== 'RECEIVING' && key.kind !== 'DESTINATION') {
        const evidence = await withTransaction(async c => c.query(`SELECT 1 FROM audit_events WHERE user_id=$1 AND movement_id=$2 AND branch_id=$3 AND action='POS_EVIDENCE_CAPTURED' AND created_at>now()-interval '10 minutes' LIMIT 1`, [user.id,key.id,row.branch_id]));
        if (!evidence.rowCount) throw new Error('Agrega primero una foto del registro en sistema.');
    }
    // Existing methods perform their own locked status, version and branch checks.
    if (key.kind === 'RECEIVING') return receivingAction(user, { action:'pos',sessionId:key.id });
    if (key.kind === 'DESTINATION') return withTransaction(async c => {
        const order=(await c.query('SELECT id,destination_branch_id FROM receiving_orders WHERE id=$1 AND voided_at IS NULL FOR UPDATE',[key.id])).rows[0];
        if(!order?.destination_branch_id)throw new Error('Pedido no disponible.');
        await requireSystemRegistration(user);
        await assertBranchAccess(user,order.destination_branch_id);
        const boxes=(await c.query(`SELECT b.id,b.counted_at,r.counted_at registered_counted_at FROM receiving_cartons b JOIN receiving_destination_arrivals a ON a.carton_id=b.id AND a.branch_id=$2 LEFT JOIN receiving_destination_registrations r ON r.carton_id=b.id WHERE b.order_id=$1 AND (r.carton_id IS NULL OR r.counted_at IS DISTINCT FROM b.counted_at) ORDER BY b.id FOR UPDATE OF b`,[key.id,order.destination_branch_id])).rows;
        if(!boxes.length||boxes.some(b=>!b.counted_at))throw new Error('El pedido cambió o tiene conteos pendientes. Actualiza antes de confirmar.');
        await c.query(`INSERT INTO receiving_destination_registrations(carton_id,order_id,branch_id,counted_at,registered_by) SELECT b.id,b.order_id,$3,b.counted_at,$4 FROM receiving_cartons b WHERE b.order_id=$1 AND b.id=ANY($2::uuid[]) ON CONFLICT(carton_id) DO UPDATE SET counted_at=excluded.counted_at,registered_by=excluded.registered_by,registered_at=now()`,[key.id,boxes.map(b=>b.id),order.destination_branch_id,user.id]);
        await c.query(`INSERT INTO audit_events(user_id,branch_id,action,previous_value,new_value) VALUES($1,$2,'RECEIVING_DESTINATION_POS_REGISTERED',$3::jsonb,$4::jsonb)`,[user.id,order.destination_branch_id,JSON.stringify(boxes),JSON.stringify({orderId:key.id,cartonIds:boxes.map(b=>b.id)})]);
        return {ok:true};
    });
    if (key.kind === 'RECEPTION') return registerPos(user,key.id);
    if (key.kind === 'EXIT') return registerExitPos(user,key.id);
    if (key.kind === 'TRANSFER') {
        if (!key.side) throw new Error('Selecciona origen o destino.');
        return registerTransferPos(user,key.id,key.side);
    }
    return registerReturnPos(user,key.id);
}
