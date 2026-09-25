-- Optional exact visual tone for product colors.
-- NULL is intentional for designs/patterns that do not have a single representative color.
ALTER TABLE product_colors
  ADD COLUMN IF NOT EXISTS hex_color varchar(7);

ALTER TABLE product_colors
  DROP CONSTRAINT IF EXISTS product_colors_hex_color_format;

ALTER TABLE product_colors
  ADD CONSTRAINT product_colors_hex_color_format
  CHECK (hex_color IS NULL OR hex_color ~ '^#[0-9A-Fa-f]{6}$');
