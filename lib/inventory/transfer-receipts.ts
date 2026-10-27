import 'server-only';
import { sql } from '@/lib/db';
import { getAuthorizedBranchIds } from '@/lib/auth/authorization';
import type { SessionUser } from '@/lib/auth/types';

export type TransferReceiptPending={id:string;folio:string;origin:string;destination:string;sent_at:string};

// Same destination access and internal-branch rule as receiveTransfer. Origin
// access alone must never turn a shipment into an incoming notification.
export async function pendingTransferReceipts(user:SessionUser):Promise<TransferReceiptPending[]>{
    const branches=await getAuthorizedBranchIds(user);
    if(branches!==null&&!branches.length)return [];
    const rows=await sql`SELECT m.id::text,m.folio,o.name origin,d.name destination,t.sent_at::text
        FROM transfers t JOIN inventory_movements m ON m.id=t.movement_id
        JOIN branches o ON o.id=t.origin_branch_id JOIN branches d ON d.id=t.destination_branch_id
        WHERE t.status::text='WAITING_RECEIPT' AND t.received_at IS NULL
          AND d.name IN ('Treviño','Plaza del Audio')
          AND (${branches}::uuid[] IS NULL OR t.destination_branch_id=ANY(${branches}::uuid[]))
        ORDER BY t.sent_at,m.id`;
    return rows as unknown as TransferReceiptPending[];
}
