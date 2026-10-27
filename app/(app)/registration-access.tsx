'use client';
import { createContext, useContext, type ReactNode } from 'react';
const Access = createContext(false);
export function RegistrationAccess({ allowed, children }: { allowed: boolean; children: ReactNode }) {
    return <Access.Provider value={allowed}>{children}</Access.Provider>;
}
export const useRegistrationAccess = () => useContext(Access);
