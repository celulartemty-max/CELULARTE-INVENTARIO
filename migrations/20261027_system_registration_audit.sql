-- Additive audit coverage. No business rows, counts, permissions or labels are changed.
CREATE TABLE IF NOT EXISTS public.receiving_destination_registrations (
  carton_id uuid PRIMARY KEY REFERENCES public.receiving_destination_arrivals(carton_id),
  order_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  counted_at timestamptz NOT NULL,
  registered_by uuid NOT NULL REFERENCES public.users(id),
  registered_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(carton_id,order_id) REFERENCES public.receiving_cartons(id,order_id),
  FOREIGN KEY(order_id,branch_id) REFERENCES public.receiving_orders(id,destination_branch_id)
);
CREATE OR REPLACE FUNCTION public.app_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor uuid;
  before_row jsonb;
  after_row jsonb;
  row_data jsonb;
  branch uuid;
  movement uuid;
  entity uuid;
  related uuid;
  binary_changed boolean;
BEGIN
  actor := NULLIF(current_setting('app.audit_user_id',true),'')::uuid;
  IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;
  row_data := COALESCE(after_row,before_row);
  -- Public sign-up is a self-created account, never an administrator action.
  IF actor IS NULL AND TG_TABLE_NAME='users' AND TG_OP='INSERT' THEN actor := (row_data->>'id')::uuid; END IF;
  -- Older application deployments have no request actor. Do not invent one.
  IF actor IS NULL THEN RETURN NULL; END IF;
  entity := CASE WHEN TG_TABLE_NAME='tiktok_label_import_source' THEN NULL ELSE COALESCE(row_data->>'id',row_data->>'user_id',row_data->>'carton_id')::uuid END;
  branch := (row_data->>'branch_id')::uuid;
  movement := (row_data->>'movement_id')::uuid;
  IF TG_TABLE_NAME='inventory_movements' THEN movement := entity; END IF;
  IF TG_TABLE_NAME IN ('reception_boxes','reception_box_lines') THEN
    related := CASE WHEN TG_TABLE_NAME='reception_boxes' THEN (row_data->>'reception_id')::uuid ELSE (SELECT b.reception_id FROM public.reception_boxes b WHERE b.id=(row_data->>'box_id')::uuid) END;
    SELECT r.movement_id INTO movement FROM public.receptions r WHERE r.id=related;
  ELSIF TG_TABLE_NAME='transfer_lines' THEN
    SELECT t.movement_id,CASE WHEN before_row->'received_quantity' IS DISTINCT FROM after_row->'received_quantity' AND TG_OP='UPDATE' THEN t.destination_branch_id ELSE t.origin_branch_id END INTO movement,branch FROM public.transfers t WHERE t.id=(row_data->>'transfer_id')::uuid;
  ELSIF TG_TABLE_NAME='transfers' THEN
    branch := CASE WHEN TG_OP='UPDATE' AND (before_row->'destination_pos_registered_at' IS DISTINCT FROM after_row->'destination_pos_registered_at' OR before_row->'received_at' IS DISTINCT FROM after_row->'received_at') THEN (row_data->>'destination_branch_id')::uuid ELSE (row_data->>'origin_branch_id')::uuid END;
  ELSIF TG_TABLE_NAME IN ('receiving_cartons','receiving_items') THEN
    related := CASE WHEN TG_TABLE_NAME='receiving_cartons' THEN entity ELSE (row_data->>'carton_id')::uuid END;
    SELECT COALESCE(a.branch_id,s.branch_id,o.branch_id) INTO branch FROM public.receiving_cartons b JOIN public.receiving_orders o ON o.id=b.order_id LEFT JOIN public.receiving_sessions s ON s.id=b.session_id LEFT JOIN public.receiving_destination_arrivals a ON a.carton_id=b.id WHERE b.id=related;
    IF branch IS NULL AND TG_TABLE_NAME='receiving_cartons' THEN SELECT o.branch_id INTO branch FROM public.receiving_orders o WHERE o.id=(row_data->>'order_id')::uuid; END IF;
  ELSIF TG_TABLE_NAME IN ('receiving_foreign_cartons','receiving_documents') THEN
    SELECT s.branch_id INTO branch FROM public.receiving_sessions s WHERE s.id=(row_data->>'session_id')::uuid;
    IF branch IS NULL AND row_data->>'order_id' IS NOT NULL THEN SELECT COALESCE(o.destination_branch_id,o.branch_id) INTO branch FROM public.receiving_orders o WHERE o.id=(row_data->>'order_id')::uuid; END IF;
  END IF;
  IF branch IS NULL AND movement IS NOT NULL THEN SELECT m.branch_id INTO branch FROM public.inventory_movements m WHERE m.id=movement; END IF;
  -- Never retain passwords, binary uploads, inline photos or credential material.
  binary_changed := before_row->'data' IS DISTINCT FROM after_row->'data' OR before_row->'file_url' IS DISTINCT FROM after_row->'file_url' OR before_row->'file_base64' IS DISTINCT FROM after_row->'file_base64';
  before_row := before_row - ARRAY['password_hash','password','data','file_url','file_base64','image','token','secret'];
  after_row := after_row - ARRAY['password_hash','password','data','file_url','file_base64','image','token','secret'];
  IF TG_TABLE_NAME='user_login_credentials' THEN
    before_row := CASE WHEN before_row IS NULL THEN NULL ELSE jsonb_build_object('user_id',row_data->>'user_id','credential_present',true) END;
    after_row := CASE WHEN after_row IS NULL THEN NULL ELSE jsonb_build_object('user_id',row_data->>'user_id','password_changed',true) END;
  ELSIF TG_OP='UPDATE' AND NOT binary_changed AND (before_row - 'updated_at') IS NOT DISTINCT FROM (after_row - 'updated_at') THEN RETURN NULL;
  END IF;
  INSERT INTO public.audit_events(user_id,branch_id,movement_id,action,entity_type,entity_id,previous_value,new_value)
    VALUES(actor,branch,movement,'ROW_'||TG_OP,TG_TABLE_NAME,entity,before_row,after_row);
  RETURN NULL;
END;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','user_module_permissions','user_login_credentials','temporary_branch_access','products','product_colors','inventory_movements','receptions','reception_boxes','reception_box_lines','exits','exit_lines','return_headers','return_lines','return_evidence','transfers','transfer_lines','receiving_sessions','receiving_orders','receiving_cartons','receiving_items','receiving_foreign_cartons','receiving_documents','receiving_destination_arrivals','receiving_destination_registrations','receiving_ai_usage','tiktok_label_catalog','tiktok_label_orders','tiktok_label_sku_history','tiktok_label_import_source'] LOOP
    IF to_regclass('public.'||tbl) IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||tbl) AND tgname='app_audit_row') THEN
      EXECUTE format('CREATE TRIGGER app_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.app_audit_change()',tbl);
    END IF;
  END LOOP;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_audit_branch_created ON public.audit_events(branch_id,created_at DESC,id DESC);
