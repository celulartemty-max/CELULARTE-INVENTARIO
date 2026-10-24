-- Reception counting may omit model, color, or both. Existing values remain unchanged.
ALTER TABLE reception_box_lines
  ALTER COLUMN color_id DROP NOT NULL,
  ALTER COLUMN model_reference DROP NOT NULL;

