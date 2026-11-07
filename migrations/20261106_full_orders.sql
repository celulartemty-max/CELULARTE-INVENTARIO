-- Additive: existing exits and historical registrations are unchanged.
CREATE TABLE IF NOT EXISTS public.full_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 1 AND 80),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 expected_pieces integer CHECK(expected_pieces BETWEEN 1 AND 10000000),
 created_by uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS full_orders_reference_unique ON public.full_orders(lower(btrim(reference)));
CREATE TABLE IF NOT EXISTS public.full_order_exits (
 order_id uuid NOT NULL REFERENCES public.full_orders(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 movement_id uuid NOT NULL UNIQUE REFERENCES public.inventory_movements(id),
 PRIMARY KEY(order_id,branch_id)
);
CREATE INDEX IF NOT EXISTS full_order_exits_branch ON public.full_order_exits(branch_id,order_id);
