ALTER TABLE transfers
  ADD COLUMN transfer_kind text NOT NULL DEFAULT 'TRANSFER'
  CHECK (transfer_kind IN ('TRANSFER','SALE'));

ALTER TABLE transfer_lines
  ADD COLUMN sale_amount numeric(12,2) NULL
  CHECK (sale_amount IS NULL OR sale_amount >= 0);
