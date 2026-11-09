-- Physical dispatch is independent of POS registration. No stock writes.
ALTER TABLE public.full_orders
 ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
 ADD COLUMN IF NOT EXISTS shipped_by uuid REFERENCES public.users(id);
ALTER TABLE public.full_order_exits
 ADD COLUMN IF NOT EXISTS waived_at timestamptz,
 ADD COLUMN IF NOT EXISTS waived_by uuid REFERENCES public.users(id);
