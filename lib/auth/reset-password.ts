import 'server-only';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTransaction } from '@/lib/db';
import type { SessionUser } from './types';

const resetSchema = z.object({
    id: z.string().uuid(),
    password: z.string().min(8).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
}).strict();

export async function resetManagedPassword(actor: SessionUser, body: unknown) {
    if (actor.role !== 'MASTER') return { status: 403, error: 'Solo MASTER puede restablecer contraseñas' };
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) return { status: 400, error: 'Indica el usuario y una contraseña de 8 a 72 bytes, sin otros cambios' };
    const { id, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    return withTransaction(async client => {
        const target = await client.query('SELECT id, role::text, status::text FROM users WHERE id=$1::uuid FOR UPDATE', [id]);
        if (!target.rows[0]) return { status: 404, error: 'Usuario no encontrado' };
        if (target.rows[0].role === 'MASTER') return { status: 403, error: 'Esta opción es solo para colaboradores, no para cuentas MASTER' };
        if (target.rows[0].status !== 'ACTIVE') return { status: 409, error: 'Activa al colaborador antes de restablecer su contraseña' };
        await client.query(`INSERT INTO user_login_credentials(user_id,password_hash) VALUES($1::uuid,$2)
            ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=now()`, [id, passwordHash]);
        return { status: 200, ok: true };
    });
}
