-- Isolated branch only. No production orders are converted by this test.
DO $$
DECLARE actor uuid; style uuid; branch uuid; oid uuid; remaining integer;
BEGIN
 SELECT id INTO actor FROM users WHERE role::text='MASTER' LIMIT 1;
 SELECT id INTO style FROM products WHERE status::text='ACTIVE' LIMIT 1;
 SELECT id INTO branch FROM branches WHERE name='Treviño' AND status::text='ACTIVE';
 IF actor IS NULL OR style IS NULL OR branch IS NULL THEN RAISE EXCEPTION 'Missing prerequisites'; END IF;
 PERFORM set_config('app.audit_user_id',actor::text,true);
 INSERT INTO full_orders(reference,title,created_by) VALUES('FINAL-TEST-'||gen_random_uuid(),'Prueba ajuste global',actor) RETURNING id INTO oid;
 INSERT INTO full_final_counts(order_id,branch_id,revision,total,plaza_snapshot,created_by) VALUES(oid,branch,1,628,'[]',actor);
 INSERT INTO full_final_count_lines(order_id,product_id,final_quantity,plaza_quantity) VALUES(oid,style,628,534);
 SELECT final_quantity-plaza_quantity-registered_delta INTO remaining FROM full_final_count_lines WHERE order_id=oid;
 IF remaining<>94 THEN RAISE EXCEPTION 'Expected pending exit 94'; END IF;
 UPDATE full_final_count_lines SET registered_delta=94 WHERE order_id=oid;
 UPDATE full_final_count_lines SET final_quantity=640 WHERE order_id=oid;
 SELECT final_quantity-plaza_quantity-registered_delta INTO remaining FROM full_final_count_lines WHERE order_id=oid;
 IF remaining<>12 THEN RAISE EXCEPTION 'Expected additional exit 12'; END IF;
 UPDATE full_final_count_lines SET final_quantity=500 WHERE order_id=oid;
 SELECT registered_delta-final_quantity+plaza_quantity INTO remaining FROM full_final_count_lines WHERE order_id=oid;
 IF remaining<>128 THEN RAISE EXCEPTION 'Expected correcting entry 128'; END IF;
 BEGIN
  INSERT INTO full_final_count_lines(order_id,product_id,final_quantity,plaza_quantity) VALUES(oid,style,1,0);
  RAISE EXCEPTION 'Duplicate accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  UPDATE full_final_counts SET total=0 WHERE order_id=oid;
  RAISE EXCEPTION 'Zero final accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
