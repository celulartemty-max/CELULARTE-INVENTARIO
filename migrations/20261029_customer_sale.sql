-- Additive: old transfers retain their existing workflow.
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS customer_sale boolean NOT NULL DEFAULT false;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES users(id);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS paid_branch_id uuid REFERENCES branches(id);
