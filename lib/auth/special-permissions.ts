import 'server-only';
import { hasModulePermission } from './authorization';
import type { SessionUser } from './types';
export const SYSTEM_REGISTRATION = 'REGISTRO_SISTEMA';
export const AUDIT_LOG = 'BITACORA';
export async function requireSystemRegistration(user: SessionUser) {
    if (!await hasModulePermission(user, SYSTEM_REGISTRATION)) throw new Error('Sin permiso de Registro en sistema.');
}
export async function requireAuditLog(user: SessionUser) {
    if (!await hasModulePermission(user, AUDIT_LOG)) throw new Error('Sin permiso de Bitácora de cambios.');
}
