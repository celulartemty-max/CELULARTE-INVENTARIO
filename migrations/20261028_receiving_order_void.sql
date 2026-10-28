-- Soft cancellation only. Cartons, items, files and receipt totals are retained.
ALTER TABLE public.receiving_orders ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.receiving_orders ADD COLUMN IF NOT EXISTS voided_reference text;
