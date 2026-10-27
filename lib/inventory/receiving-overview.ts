import 'server-only';
import { withTransaction } from '@/lib/db';
import { getAuthorizedBranchIds } from '@/lib/auth/authorization';
import type { SessionUser } from '@/lib/auth/types';
import { receivingAccess } from './receiving';

export type ReceiptDestination = {
    session_id: string; order_id: string; product: string; marking: string; shipping: string;
    destination: string; boxes: number; arrived: number; counted: number; can_open: boolean;
};
export type ReceiptOverview = {
    id: string; reference: string; arrival_date: string; total_boxes: number; status: string;
    origin: string; arrived: number; counted: number | null; can_open: boolean;
    destinations: ReceiptDestination[];
};

export async function receivingOverview(u: SessionUser): Promise<ReceiptOverview[]> {
    await receivingAccess(u);
    const ids = await getAuthorizedBranchIds(u);
    return withTransaction(async c => {
        // A destination sees only the shared receipt envelope, not its other orders,
        // costs, documents or origin counts. EXISTS cannot multiply physical cartons.
        const receipts = (await c.query(`SELECT s.id::text,s.reference,s.arrival_date::text,s.total_boxes,s.status,origin.name origin,
            ($1::uuid[] IS NULL OR s.branch_id=ANY($1::uuid[])) can_open,
            count(b.id)::int + COALESCE((SELECT sum(f.carton_count) FROM receiving_foreign_cartons f WHERE f.session_id=s.id AND f.voided_at IS NULL),0)::int arrived,
            CASE WHEN $1::uuid[] IS NULL OR s.branch_id=ANY($1::uuid[]) THEN count(b.counted_at) FILTER(WHERE NOT o.is_foreign)::int ELSE NULL END counted
            FROM receiving_sessions s JOIN branches origin ON origin.id=s.branch_id
            LEFT JOIN receiving_cartons b ON b.session_id=s.id LEFT JOIN receiving_orders o ON o.id=b.order_id
            WHERE $1::uuid[] IS NULL OR s.branch_id=ANY($1::uuid[]) OR EXISTS(
                SELECT 1 FROM receiving_cartons own_box JOIN receiving_orders own_order ON own_order.id=own_box.order_id
                WHERE own_box.session_id=s.id AND own_order.destination_branch_id<>s.branch_id AND own_order.destination_branch_id=ANY($1::uuid[]))
            GROUP BY s.id,origin.name ORDER BY s.created_at DESC,s.id`, [ids])).rows as Omit<ReceiptOverview, 'destinations'>[];
        const destinations = (await c.query(`SELECT b.session_id::text,o.id::text order_id,COALESCE(p.name,o.product_label,'Sin producto') product,
            o.marking,o.shipping,dest.name destination,count(b.id)::int boxes,count(a.carton_id)::int arrived,
            count(b.counted_at) FILTER(WHERE a.carton_id IS NOT NULL)::int counted,
            ($1::uuid[] IS NULL OR o.destination_branch_id=ANY($1::uuid[])) can_open
            FROM receiving_cartons b JOIN receiving_sessions s ON s.id=b.session_id JOIN receiving_orders o ON o.id=b.order_id
            JOIN branches dest ON dest.id=o.destination_branch_id LEFT JOIN products p ON p.id=o.product_id
            LEFT JOIN receiving_destination_arrivals a ON a.carton_id=b.id AND a.branch_id=o.destination_branch_id
            WHERE o.destination_branch_id<>s.branch_id AND ($1::uuid[] IS NULL OR s.branch_id=ANY($1::uuid[]) OR o.destination_branch_id=ANY($1::uuid[]))
            GROUP BY b.session_id,o.id,p.name,dest.name ORDER BY dest.name,o.created_at,o.id`, [ids])).rows as ReceiptDestination[];
        const byReceipt = new Map<string, ReceiptDestination[]>();
        for (const destination of destinations) {
            const group = byReceipt.get(destination.session_id) ?? [];
            group.push(destination); byReceipt.set(destination.session_id, group);
        }
        return receipts.map(receipt => ({ ...receipt, destinations: byReceipt.get(receipt.id) ?? [] }));
    });
}
