# Destination rollout status

Database foundation tested on an isolated branch and applied to production with explicit user approval. Shipping Mark/provider editing is the first application release. Cross-branch workspace is not enabled yet.

- Migration: migrations/20261027_receiving_destination.sql
- Migration ID: 44f8dcbf-565d-4854-ad4b-0a53ebc9647a
- Test branch: br-green-bonus-b5ygewq5 (deleted by completed migration)
- Parent: br-nameless-waterfall-b57e5g01
- Project: snowy-firefly-56471151
- Database: celularte_inventario
- Prepared with Neon prepare_database_migration. Complete requires explicit production approval.

Confirmed: four orders, forty cartons, ninety-seven items and one completed carton unchanged. Count fingerprint matches production. Eighteen TikTok orders unchanged.

PER LISA becomes mark PER with optional supplier LISA. Previous marks are preserved in a backup table. PER routes to Treviño and JAPS to Plaza del Audio. Other allowed codes have no internal destination.

DB tests: partial arrival of two JAPS cartons, duplicate confirmation rejected, wrong destination rejected, destination reassignment after arrival rejected. All test confirmations rolled back.

Implemented first release: order-wide Shipping Mark/provider editing and audit, closed Shipping Mark selectors, server-derived destination and is_foreign on new orders, protection against changing marks after captured counts. Existing is_foreign values remain intact until explicit order editing.

Remaining before cross-branch feature release: per-user branch authorization on list/view/actions/documents/exports, destination arrival confirmation UI, count gating, branch-specific completion/POS handling, and end-to-end permission tests.

Do not claim the cross-branch feature is active. Migration approval was granted and completed. Preserve existing cartons, counts and documents.
