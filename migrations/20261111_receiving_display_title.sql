-- A label for the operating team, independent of ownership and shipping mark.
ALTER TABLE receiving_orders ADD COLUMN IF NOT EXISTS display_title text NOT NULL DEFAULT '' CHECK (length(display_title)<=80);
