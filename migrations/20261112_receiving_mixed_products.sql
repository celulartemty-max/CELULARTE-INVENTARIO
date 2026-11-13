ALTER TABLE receiving_orders ADD COLUMN IF NOT EXISTS is_mixed boolean NOT NULL DEFAULT false;
ALTER TABLE receiving_orders DROP CONSTRAINT IF EXISTS receiving_orders_product_required;
ALTER TABLE receiving_orders ADD CONSTRAINT receiving_orders_product_required CHECK (product_id IS NOT NULL OR is_mixed OR (is_foreign AND product_label IS NOT NULL AND length(trim(product_label)) BETWEEN 1 AND 160));
ALTER TABLE receiving_items ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id);
ALTER TABLE receiving_items ADD COLUMN IF NOT EXISTS product_label text NOT NULL DEFAULT '';
ALTER TABLE receiving_items DROP CONSTRAINT IF EXISTS receiving_items_carton_id_model_color_key;
CREATE UNIQUE INDEX IF NOT EXISTS receiving_items_product_combination ON receiving_items(carton_id,COALESCE(product_id,'00000000-0000-0000-0000-000000000000'::uuid),model,color);
