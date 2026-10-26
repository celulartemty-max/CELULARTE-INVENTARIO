-- Additive: existing orders stay local. Legacy foreign registries remain unchanged.
ALTER TABLE receiving_orders ADD COLUMN is_foreign boolean NOT NULL DEFAULT false;
ALTER TABLE receiving_orders ADD COLUMN product_label text;
ALTER TABLE receiving_orders ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE receiving_orders ADD CONSTRAINT receiving_orders_product_required CHECK(product_id IS NOT NULL OR (is_foreign AND product_label IS NOT NULL AND length(trim(product_label)) BETWEEN 1 AND 160));
