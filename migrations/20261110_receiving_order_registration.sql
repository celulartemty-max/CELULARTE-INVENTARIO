-- A carton can be confirmed in origin exactly once, independently of its receipt.
CREATE TABLE receiving_origin_registrations (
 carton_id uuid PRIMARY KEY REFERENCES receiving_cartons(id),
 order_id uuid NOT NULL REFERENCES receiving_orders(id),
 session_id uuid NOT NULL REFERENCES receiving_sessions(id),
 branch_id uuid NOT NULL REFERENCES branches(id),
 counted_at timestamptz,
 registered_by uuid REFERENCES users(id),
 registered_at timestamptz NOT NULL DEFAULT now(),
 snapshot jsonb NOT NULL,
 legacy boolean NOT NULL DEFAULT false
);
CREATE INDEX receiving_origin_registrations_order ON receiving_origin_registrations(order_id);
-- Already confirmed receipts must never reappear as new entries.
INSERT INTO receiving_origin_registrations(carton_id,order_id,session_id,branch_id,counted_at,registered_by,registered_at,snapshot,legacy)
 SELECT b.id,b.order_id,s.id,s.branch_id,b.counted_at,a.user_id,COALESCE(a.created_at,s.created_at),
 COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM receiving_items l WHERE l.carton_id=b.id),'[]'::jsonb),true
 FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id JOIN receiving_sessions s ON s.id=b.session_id
 LEFT JOIN LATERAL (SELECT user_id,created_at FROM audit_events WHERE action='RECEIVING_POS_REGISTERED' AND new_value->>'sessionId'=s.id::text ORDER BY created_at DESC LIMIT 1) a ON true
 WHERE s.status='POS_REGISTERED' AND NOT o.is_foreign;

-- Preserve confirmed quantities and routing even while other orders remain open.
CREATE FUNCTION protect_origin_registered_carton() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='receiving_items' THEN
  IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM receiving_origin_registrations WHERE carton_id=OLD.carton_id) THEN
   RAISE EXCEPTION 'Esta caja ya está registrada en sistema. Su contenido está protegido.';
  END IF;
  IF TG_OP<>'DELETE' THEN target:=NEW.carton_id; END IF;
 ELSE
  target:=OLD.id;
 END IF;
 IF EXISTS(SELECT 1 FROM receiving_origin_registrations WHERE carton_id=target) THEN
  RAISE EXCEPTION 'Esta caja ya está registrada en sistema. Su contenido está protegido.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receiving_items_origin_protected BEFORE INSERT OR UPDATE OR DELETE ON receiving_items FOR EACH ROW EXECUTE FUNCTION protect_origin_registered_carton();
CREATE TRIGGER receiving_cartons_origin_protected BEFORE UPDATE OR DELETE ON receiving_cartons FOR EACH ROW EXECUTE FUNCTION protect_origin_registered_carton();
CREATE FUNCTION protect_origin_registered_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.product_id,OLD.branch_id,OLD.destination_branch_id,OLD.is_foreign,OLD.marking,OLD.voided_at)
  IS DISTINCT FROM (NEW.product_id,NEW.branch_id,NEW.destination_branch_id,NEW.is_foreign,NEW.marking,NEW.voided_at)
  AND EXISTS(SELECT 1 FROM receiving_origin_registrations WHERE order_id=OLD.id) THEN
  RAISE EXCEPTION 'El pedido contiene cajas registradas en sistema. No se puede cambiar su producto o destino.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receiving_orders_origin_protected BEFORE UPDATE ON receiving_orders FOR EACH ROW EXECUTE FUNCTION protect_origin_registered_order();
