-- Registered-box recounts never mutate protected receiving_items or original POS snapshots.
CREATE TABLE IF NOT EXISTS public.receiving_registered_recounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 carton_id uuid NOT NULL REFERENCES public.receiving_cartons(id),
 session_id uuid NOT NULL REFERENCES public.receiving_sessions(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 authorized_by uuid NOT NULL REFERENCES public.users(id),
 authorized_at timestamptz NOT NULL DEFAULT now(),
 baseline jsonb NOT NULL,
 draft jsonb,
 completed_by uuid REFERENCES public.users(id),
 completed_at timestamptz,
 adjustments jsonb,
 registered_by uuid REFERENCES public.users(id),
 registered_at timestamptz,
 CHECK (jsonb_typeof(baseline)='array'),
 CHECK (draft IS NULL OR jsonb_typeof(draft)='array'),
 CHECK (adjustments IS NULL OR jsonb_typeof(adjustments)='array'),
 CHECK (completed_at IS NULL OR (completed_by IS NOT NULL AND adjustments IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS receiving_registered_recounts_one_active
 ON public.receiving_registered_recounts(carton_id) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS receiving_registered_recounts_pending
 ON public.receiving_registered_recounts(branch_id,completed_at) WHERE completed_at IS NOT NULL AND registered_at IS NULL;
