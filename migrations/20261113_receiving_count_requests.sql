CREATE TABLE IF NOT EXISTS receiving_count_requests (
 order_id uuid NOT NULL REFERENCES receiving_orders(id),
 user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','DENIED')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 decided_by uuid REFERENCES users(id),
 decided_at timestamptz,
 PRIMARY KEY(order_id,user_id)
);
CREATE INDEX IF NOT EXISTS receiving_count_requests_pending ON receiving_count_requests(requested_at) WHERE status='PENDING';
