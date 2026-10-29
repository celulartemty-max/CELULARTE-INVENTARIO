import {receiptPendingSql} from './receipt-pending';
import 'server-only';
import {withTransaction} from '@/lib/db';

export async function receivingStats(branches:string[]|null){
  if(branches!==null&&!branches.length)return {open:0,closed:0};
  const rows=await withTransaction(async c=>(await c.query(`SELECT count(*) FILTER(WHERE ${receiptPendingSql})::int open,
    count(*) FILTER(WHERE status IN ('CLOSED','POS_REGISTERED','ARCHIVED') AND created_at>=now()-interval '30 days')::int closed
    FROM receiving_sessions s WHERE ($1::uuid[] IS NULL OR branch_id=ANY($1::uuid[]))`,[branches])).rows);
  return {open:Number(rows[0]?.open??0),closed:Number(rows[0]?.closed??0)};
}
