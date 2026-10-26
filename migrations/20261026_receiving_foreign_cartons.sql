-- Preserve existing receipts, inventory and TikTok. Foreign records never own items or packing lists.
ALTER TABLE receiving_orders DROP CONSTRAINT receiving_orders_marking_check;
ALTER TABLE receiving_orders ADD CONSTRAINT receiving_orders_marking_check CHECK(length(trim(marking)) BETWEEN 1 AND 160);
ALTER TABLE receiving_cartons ADD COLUMN marking text CHECK(marking IS NULL OR length(trim(marking)) BETWEEN 1 AND 160);
ALTER TABLE receiving_sessions ADD COLUMN carrier text NOT NULL DEFAULT '';
ALTER TABLE receiving_sessions ADD COLUMN tracking text NOT NULL DEFAULT '';
ALTER TABLE receiving_sessions DROP CONSTRAINT receiving_sessions_status_check;
ALTER TABLE receiving_sessions ADD CONSTRAINT receiving_sessions_status_check CHECK(status IN ('DRAFT','CLOSED','POS_REGISTERED','ARCHIVED'));
CREATE TABLE receiving_foreign_cartons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES receiving_sessions(id),
 product text NOT NULL CHECK(length(trim(product)) BETWEEN 1 AND 160),
 carton_count integer NOT NULL CHECK(carton_count BETWEEN 1 AND 1000),
 shipping text NOT NULL CHECK(shipping IN ('SEA','AIR')),
 marking text NOT NULL CHECK(length(trim(marking)) BETWEEN 1 AND 160),
 notes text NOT NULL DEFAULT '', voided_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receiving_foreign_cartons_session ON receiving_foreign_cartons(session_id) WHERE voided_at IS NULL;
