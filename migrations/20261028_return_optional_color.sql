-- Product-only returns must not depend on the legacy colour catalogue.
-- Keep every existing colour and the composite FK; only allow absent colours.
ALTER TABLE return_lines ALTER COLUMN color_id DROP NOT NULL;
