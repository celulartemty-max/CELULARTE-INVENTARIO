# System registration and audit rollout — database activated 2026-10-27

Base main: 60307a8da837dd021857deeb2c1c67c6c47224e8. Development worktree: CELULARTE-register-audit, branch feature/system-register-audit.

## Implemented locally

- Separate REGISTRO_SISTEMA and BITACORA permissions, MASTER access by existing policy; no grants made to other accounts.
- Restricted /registros pending queue, detail, independent transfer sides, photo evidence for legacy movements, manual confirmation and branch-scoped history.
- Restricted /bitacora with date, section, actor and pagination filters. Global administration events are MASTER-only because non-global users are branch-scoped.
- All old POS confirmation handlers now require the special permission, not just the new screen. Pending/status/branch checks still use the locked original methods.
- Current user role, active status and primary branch are read from users instead of trusting the stale 12-hour session payload.
- Explicit AsyncLocalStorage actor boundaries around every authenticated write route. HTTP SQL sets transaction-local actor in the same batch; pooled client transactions set it after BEGIN. No actor is extracted from request JSON.
- Additive row audit migration covering inventory, receiving/counts, catalog, user access and labels. Before/after snapshots exclude password hashes and binary upload fields. Public account creation is self-attributed. Existing application-level audit events remain intact.
- Automatic audit is prospective: older edits cannot be reconstructed. No production data has been updated by this implementation.

## Resolved blocker

After explicit approval, isolated branch br-weathered-waterfall-b5i599kn was created with account defaults. No account settings or credentials changed. It is retained pending separate cleanup authorization.

Project snowy-firefly-56471151; parent br-nameless-waterfall-b57e5g01; database celularte_inventario. Use only link_6adc49c19a4c8191bbbe7e5a04b5b151.

## Required database verification before release

1. Create an isolated test branch with default compute settings after approval. Do not pull or expose credentials. Do not change any existing branches or account settings.
2. Apply migrations/20261027_system_registration_audit.sql only on the isolated branch, using complete SQL function / DO blocks, not a naive semicolon split.
3. Insert dedicated test fixtures inside a transaction. Set app.audit_user_id with set_config(...,true). Verify insert/update/delete before/after, branch/movement attribution, rollback, secret/binary redaction, no-op suppression, credentials metadata, and independent actors. Roll back fixture data. Do not modify existing production-like rows for testing.
4. Verify pending SQL against real enum/schema types, receipt CLOSED vs ARCHIVED/DRAFT, corrections, two transfer sides and external destinations. Verify user/permission revocation, history and source/destination isolation.
5. Confirm tables in the migration match actual tables, and review trigger behavior for deletes/cascades. Optional tables missing when the migration runs need a future trigger-install migration if introduced later.
6. Get explicit approval for production activation (or follow the user's conditional approval only after all tests pass). Apply the additive migration and publish the tested application version together. Deploying the application without the triggers would NOT provide comprehensive audit coverage.
7. Do not claim activation until the database migration is verified and Vercel production is READY. No existing labels, cartons or counts should be deleted, moved or reset.

Verification completed: 125 tests passing, TypeScript passing, lint without errors (3 pre-existing image warnings), production webpack build passing. The complete migration passed on the isolated branch. tests/system-registration-db.sql uses dedicated fixtures and rolls them all back; it verifies insert/update/delete, before/after, no-op suppression, credentials/binary redaction, same-name binary replacement, actor and branch attribution, permission revocation, null vs zero, legacy movements, destination confirmations and recount corrections. The actual pending SQL compiled and was used by the database tests.

Production migration activated in one repeatable-read transaction with 30 row triggers verified. Before/after counts and checksums were identical: 43 cartons, 97 receiving items and 18 TikTok label orders. No existing business rows or permissions changed. Audit is prospective, not reconstruction of prior edits.

Destination arrivals now have per-carton registration stamps. Only physically arrived and fully counted pending cartons qualify. Later deliveries and recounts appear as pending batches within the same order. Confirmation remains manual; no connection to or write into external POS software exists.

The required verification steps above are retained as the rollout procedure. Production application READY status must still be confirmed before announcing the release live. No authenticated live-user browser test was performed.
