# Destination rollout status

Database foundation tested on an isolated branch and applied to production with explicit user approval. Shipping Mark/provider editing was released first. This release adds the cross-branch arrival/count workspace.

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

Entry point: /entradas/pedidos. Cross-branch cartons appear inside their original receipt card under “Cajas por sucursal”; no extra receipt or separate top-level incoming-orders card is created. The old /entradas/pedidos/destino bookmark redirects to this list. A destination-only user sees the shared origin receipt reference/date/branch/physical total and only their own order summaries, never origin count quantities, costs, unrelated orders or source workspace access. Per-order/carton counts are grouped by original session so a partial order arriving in several receipts is not duplicated in physical totals. Destination action links remain permission-scoped.

Mutations recheck module and destination permissions and lock the order to serialize origin mark edits. Manager/MASTER confirm selected physical arrivals; counts and manual lines require confirmation per carton. Original session IDs are never moved. Origin receipt closure does not block destination work. Packing import accepts only confirmed empty cartons, with no overwrite. Destination documents require reviewer access and at least one confirmed carton. Existing source document/export access remains origin-scoped; no new destination export is exposed.

Completion is tracked by each carton's counted_at and displayed as counted/total in the destination list. This release does not register destination stock in POS and does not modify origin receipt status when destination count finishes. No automated tests insert confirmations or counts into production. Unit/regression tests cover branch/module gates, unconfirmed boxes, partial arrival, duplicate/unrelated IDs, real zero vs blank, completed-count protection, audited MASTER recount, documents, and mobile box switching without losing forms.
