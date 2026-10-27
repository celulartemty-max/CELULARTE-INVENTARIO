import 'server-only';
import { z } from 'zod';
import { withTransaction } from '@/lib/db';
import { getAuthorizedBranchIds } from '@/lib/auth/authorization';
import { requireAuditLog } from '@/lib/auth/special-permissions';
import type { SessionUser } from '@/lib/auth/types';

// Legacy payloads can contain inline photos. Redact recursively before serializing
// any audit detail into an HTML response or client component.
export function safeAuditValue(value: unknown): unknown {
    if (typeof value === 'string') return value.startsWith('data:') ? '[archivo omitido]' : value.slice(0,4000);
    if (Array.isArray(value)) return value.slice(0,500).map(safeAuditValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret|token|cookie|image|^data$|file_url|file_base64|authorization/i.test(key)).map(([key,v]) => [key,safeAuditValue(v)]));
    return value;
}
export async function auditLog(user: SessionUser, raw: { page?: unknown; actor?: unknown; entity?: unknown; date?: unknown }) {
    await requireAuditLog(user);
    const page = z.coerce.number().int().min(1).max(10000).catch(1).parse(raw.page ?? 1);
    const actor = z.string().uuid().optional().catch(undefined).parse(raw.actor || undefined);
    const entity = z.string().max(100).optional().catch(undefined).parse(raw.entity || undefined);
    const date = z.string().date().optional().catch(undefined).parse(raw.date || undefined);
    const branches = await getAuthorizedBranchIds(user);
    return withTransaction(async c => {
        const rows = (await c.query(`SELECT a.id::text,a.user_id::text,u.name actor,b.name branch,a.action,a.entity_type,a.entity_id::text,a.movement_id::text,a.created_at::text,a.previous_value,a.new_value
            FROM audit_events a JOIN users u ON u.id=a.user_id LEFT JOIN branches b ON b.id=a.branch_id
            WHERE ($1::uuid[] IS NULL OR a.branch_id=ANY($1::uuid[])) AND ($2::uuid IS NULL OR a.user_id=$2)
            AND ($3::text IS NULL OR a.entity_type=$3) AND ($4::date IS NULL OR (a.created_at AT TIME ZONE 'America/Monterrey')::date=$4)
            ORDER BY a.created_at DESC,a.id DESC LIMIT 51 OFFSET $5`, [branches,actor??null,entity??null,date??null,(page-1)*50])).rows;
        return { page, more: rows.length > 50, rows: rows.slice(0,50).map(r=>({...r,previous_value:safeAuditValue(r.previous_value),new_value:safeAuditValue(r.new_value)})) };
    });
}
