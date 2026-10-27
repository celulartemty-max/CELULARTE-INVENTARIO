import 'server-only';
import { requireUser } from '@/lib/auth/authorization';
import { withAuditActor } from './context';

// Explicit request boundary: never share the actor between simultaneous requests.
export function auditRoute<Args extends unknown[], Result>(handler: (...args: Args) => Promise<Result>) {
    return async (...args: Args) => {
        const user = await requireUser();
        return withAuditActor(user.id, () => handler(...args));
    };
}
