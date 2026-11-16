-- Explicit final FULL count; no migration of historical movements or POS confirmations.
CREATE TABLE IF NOT EXISTS full_final_counts (
 order_id uuid PRIMARY KEY REFERENCES full_orders(id),
 branch_id uuid NOT NULL REFERENCES branches(id),
 revision integer NOT NULL CHECK(revision>0),
 total integer NOT NULL CHECK(total>0 AND total<=10000000),
 plaza_snapshot jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS full_final_count_lines (
 order_id uuid NOT NULL REFERENCES full_final_counts(order_id),
 product_id uuid NOT NULL REFERENCES products(id),
 final_quantity integer NOT NULL CHECK(final_quantity>=0 AND final_quantity<=10000000),
 plaza_quantity integer NOT NULL CHECK(plaza_quantity>=0 AND plaza_quantity<=10000000),
 registered_delta integer NOT NULL DEFAULT 0,
 PRIMARY KEY(order_id,product_id)
);
CREATE INDEX IF NOT EXISTS full_final_counts_branch_idx ON full_final_counts(branch_id);
