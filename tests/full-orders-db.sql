-- Run only on the isolated test branch, never production. Fixtures stay there.
DO $$
DECLARE actor uuid; product uuid; bs uuid[]; oid uuid; mid uuid; b uuid;
        n int; total int; mode int;
BEGIN
 SELECT id INTO actor FROM users WHERE role::text='MASTER' LIMIT 1;
 SELECT id INTO product FROM products WHERE status::text='ACTIVE' LIMIT 1;
 SELECT array_agg(id ORDER BY name) INTO bs FROM branches
  WHERE status::text='ACTIVE' AND name IN ('Treviño','Plaza del Audio');
 IF actor IS NULL OR product IS NULL OR cardinality(bs)<>2 THEN
  RAISE EXCEPTION 'Missing test prerequisites';
 END IF;
 FOR mode IN 1..3 LOOP
  INSERT INTO full_orders(reference,title,expected_pieces,created_by)
   VALUES('FIXTURE-'||gen_random_uuid(),'Prueba aislada FULL',CASE WHEN mode=3 THEN 500 ELSE 200 END,actor)
   RETURNING id INTO oid;
  FOR n IN 1..(CASE WHEN mode=3 THEN 2 ELSE 1 END) LOOP
   b:=bs[CASE WHEN mode=2 THEN 2 ELSE n END];
   INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by)
    VALUES('FIXTURE-'||gen_random_uuid(),'EXIT',b,actor) RETURNING id INTO mid;
   INSERT INTO exits(movement_id,channel,exit_type) VALUES(mid,'MERCADO_LIBRE','FULL');
   INSERT INTO full_order_exits(order_id,branch_id,movement_id) VALUES(oid,b,mid);
   INSERT INTO exit_lines(movement_id,product_id,quantity)
    VALUES(mid,product,CASE WHEN n=2 THEN 300 ELSE 200 END);
  END LOOP;
  SELECT sum(l.quantity)::int INTO total FROM full_order_exits x
   JOIN exit_lines l ON l.movement_id=x.movement_id WHERE x.order_id=oid;
  IF total<>(CASE WHEN mode=3 THEN 500 ELSE 200 END) THEN
   RAISE EXCEPTION 'Total does not reconcile';
  END IF;
  BEGIN
   INSERT INTO full_order_exits(order_id,branch_id,movement_id) VALUES(oid,b,mid);
   RAISE EXCEPTION 'Duplicate link accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
 END LOOP;
END $$;
