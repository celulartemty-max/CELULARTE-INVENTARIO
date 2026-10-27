import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage<{ userId: string }>();
export const auditActor = () => context.getStore()?.userId;
export function withAuditActor<T>(userId: string, task: () => T): T {
    return context.run({ userId }, task);
}
