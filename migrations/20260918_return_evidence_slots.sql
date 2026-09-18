ALTER TABLE return_evidence ADD COLUMN slot smallint;
WITH ranked AS (
  SELECT id,row_number() OVER (PARTITION BY movement_id ORDER BY uploaded_at,id) rn
  FROM return_evidence
)
UPDATE return_evidence e SET slot=r.rn FROM ranked r WHERE r.id=e.id;
ALTER TABLE return_evidence ALTER COLUMN slot SET NOT NULL;
ALTER TABLE return_evidence ADD CONSTRAINT return_evidence_slot_check CHECK (slot BETWEEN 1 AND 2);
ALTER TABLE return_evidence ADD CONSTRAINT return_evidence_movement_slot_key UNIQUE (movement_id,slot);
