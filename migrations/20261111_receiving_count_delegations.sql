-- Delegates physical counting only. Ownership, destination and POS remain unchanged.
CREATE TABLE IF NOT EXISTS receiving_count_delegations (
 order_id uuid PRIMARY KEY REFERENCES receiving_orders(id),
 branch_id uuid NOT NULL REFERENCES branches(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
