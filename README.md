# CELULARTE Inventario

Aplicación operativa independiente para CELULARTE. Next.js + TypeScript + Neon/PostgreSQL.

## Fase 1
- Login server-side con cookie HttpOnly firmada (JWT HS256).
- Credenciales bootstrap almacenadas solo en variables de entorno; contraseñas como bcrypt hashes.
- Rol, estado y sucursal siempre se leen de `users` en PostgreSQL.
- Autorización server-side: MASTER/ADMIN global; OPERATIVE limitado a `primary_branch_id` + `temporary_branch_access` vigente.
- Dashboard responsive con movimientos recientes y accesos a los cuatro flujos.
- Fechas presentadas en `America/Monterrey`; PostgreSQL conserva `timestamptz`.

## Variables
Copiar `.env.example` a `.env.local`. Nunca subir credenciales. En Vercel configurar `DATABASE_URL`, `AUTH_SECRET` y `AUTH_CREDENTIALS_JSON` como secretos.

## Validación
`npm run lint && npm run typecheck && npm test && npm run build`

## Seguridad
La UI no es la frontera de seguridad. Toda mutación futura debe llamar `requireUser()` y `assertBranchAccess()` en servidor antes de acceder o modificar movimientos.
