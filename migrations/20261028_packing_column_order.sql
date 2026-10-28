-- Add presentation metadata only. Never infer or overwrite historical counts.
ALTER TABLE public.receiving_orders ADD COLUMN IF NOT EXISTS color_order text[] NOT NULL DEFAULT '{}';
