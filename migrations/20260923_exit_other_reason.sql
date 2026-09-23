-- Permite registrar salidas que no provienen de MercadoLibre o TikTok.
ALTER TYPE exit_channel ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TABLE exits ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE exits DROP CONSTRAINT IF EXISTS exits_other_reason_check;
ALTER TABLE exits ADD CONSTRAINT exits_other_reason_check CHECK (
  (channel = 'OTHER'::exit_channel AND reason IS NOT NULL AND length(trim(reason)) > 0)
  OR
  (channel <> 'OTHER'::exit_channel AND reason IS NULL)
);
