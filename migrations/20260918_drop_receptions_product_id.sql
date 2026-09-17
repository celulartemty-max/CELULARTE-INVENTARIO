-- Fase 2: una recepción puede contener múltiples productos; los productos viven en reception_box_lines.
-- Preflight realizado: 0 receptions y única dependencia = receptions_product_id_fkey.
ALTER TABLE public.receptions DROP COLUMN IF EXISTS product_id;
-- Rollback conceptual si fuera necesario: ALTER TABLE public.receptions ADD COLUMN product_id uuid REFERENCES public.products(id); -- requeriría decidir/backfill por recepción y por eso no se automatiza.
