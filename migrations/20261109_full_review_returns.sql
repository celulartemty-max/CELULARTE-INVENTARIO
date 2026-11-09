CREATE TABLE IF NOT EXISTS full_exit_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), movement_id uuid NOT NULL UNIQUE REFERENCES inventory_movements(id),
 order_id uuid NOT NULL REFERENCES full_orders(id), source_branch_id uuid NOT NULL REFERENCES branches(id),
 holding_branch_id uuid NOT NULL REFERENCES branches(id), reviewed_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS full_review_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES full_exit_reviews(id),
 original_line_id uuid NOT NULL UNIQUE, product_id uuid NOT NULL REFERENCES products(id),
 sent integer NOT NULL CHECK(sent>0), accepted integer NOT NULL CHECK(accepted>=0 AND accepted<=sent),
 detail text NOT NULL DEFAULT '' CHECK(length(detail)<=500), CHECK(accepted=sent OR length(btrim(detail))>0)
);
CREATE TABLE IF NOT EXISTS full_return_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), folio text NOT NULL UNIQUE, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS full_return_batch_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES full_return_batches(id),
 review_line_id uuid NOT NULL REFERENCES full_review_lines(id), quantity integer NOT NULL CHECK(quantity>0),
 received integer NOT NULL DEFAULT 0 CHECK(received>=0 AND received<=quantity), UNIQUE(batch_id,review_line_id)
);
CREATE TABLE IF NOT EXISTS full_return_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_line_id uuid NOT NULL REFERENCES full_return_batch_lines(id),
 quantity integer NOT NULL CHECK(quantity>0), received_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS full_review_lines_review_idx ON full_review_lines(review_id);
CREATE INDEX IF NOT EXISTS full_return_allocations_idx ON full_return_batch_lines(review_line_id);
CREATE TABLE IF NOT EXISTS full_workflow_requests (
 id uuid PRIMARY KEY, action text NOT NULL, user_id uuid NOT NULL REFERENCES users(id), payload jsonb NOT NULL, result jsonb NOT NULL
);
