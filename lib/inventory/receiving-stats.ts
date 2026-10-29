import 'server-only';
import {sql} from '@/lib/db';

export async function receivingStats(branches:string[]|null){
  if(branches!==null&&!branches.length)return {open:0,closed:0};
  const rows=await sql`SELECT count(*) FILTER(WHERE status='DRAFT')::int open,
    count(*) FILTER(WHERE status IN ('CLOSED','POS_REGISTERED','ARCHIVED') AND created_at>=now()-interval '30 days')::int closed
    FROM receiving_sessions WHERE (${branches}::uuid[] IS NULL OR branch_id=ANY(${branches}::uuid[]))`;
  return {open:Number(rows[0]?.open??0),closed:Number(rows[0]?.closed??0)};
}
