-- Isolated branch only. Synthetic fixtures roll back via a caught exception.
DO $$
DECLARE actor uuid; branch uuid; product uuid; receipt uuid; ready uuid; waiting uuid; box uuid; pending_box uuid; line uuid; n integer; blocked boolean;
BEGIN
 BEGIN
  SELECT id INTO actor FROM users WHERE role='MASTER' LIMIT 1;
  SELECT id INTO branch FROM branches WHERE name='Treviño';
  SELECT id INTO product FROM products WHERE status='ACTIVE' LIMIT 1;
  INSERT INTO receiving_sessions(branch_id,reference,arrival_date,total_boxes,created_by) VALUES(branch,'ORDER REGISTRATION QA '||gen_random_uuid(),current_date,2,actor) RETURNING id INTO receipt;
  INSERT INTO receiving_orders(branch_id,reference,product_id,shipping,marking,destination_branch_id,created_by) VALUES(branch,'READY QA '||gen_random_uuid(),product,'SEA','PER',branch,actor) RETURNING id INTO ready;
  INSERT INTO receiving_orders(branch_id,reference,product_id,shipping,marking,destination_branch_id,created_by) VALUES(branch,'WAITING QA '||gen_random_uuid(),product,'SEA','PER',branch,actor) RETURNING id INTO waiting;
  INSERT INTO receiving_cartons(order_id,carton_number,session_id,counted_at,counted_by) VALUES(ready,'1',receipt,now(),actor) RETURNING id INTO box;
  INSERT INTO receiving_items(carton_id,model,color,expected,counted) VALUES(box,'READY','BLACK',0,0) RETURNING id INTO line;
  INSERT INTO receiving_cartons(order_id,carton_number,session_id) VALUES(waiting,'1',receipt) RETURNING id INTO pending_box;
  INSERT INTO receiving_items(carton_id,model,color,expected) VALUES(pending_box,'WAITING','BLACK',10);
  IF NOT EXISTS(SELECT 1 FROM origin_qa_pending WHERE id=ready::text AND kind='RECEIVING_ORDER') THEN RAISE EXCEPTION 'Ready order blocked by other product'; END IF;
  IF EXISTS(SELECT 1 FROM origin_qa_pending WHERE id=waiting::text) THEN RAISE EXCEPTION 'Uncounted order appeared'; END IF;
  INSERT INTO receiving_origin_registrations(carton_id,order_id,session_id,branch_id,counted_at,registered_by,snapshot) SELECT id,order_id,session_id,branch,counted_at,actor,'[]'::jsonb FROM receiving_cartons WHERE id=box;
  IF EXISTS(SELECT 1 FROM origin_qa_pending WHERE id=ready::text) THEN RAISE EXCEPTION 'Already registered order still pending'; END IF;
  blocked:=false;BEGIN UPDATE receiving_items SET counted=20 WHERE id=line; EXCEPTION WHEN raise_exception THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Registered quantity was editable'; END IF;
  blocked:=false;BEGIN UPDATE receiving_cartons SET counted_at=NULL WHERE id=box; EXCEPTION WHEN raise_exception THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Registered carton was reopened'; END IF;
  blocked:=false;BEGIN UPDATE receiving_orders SET marking='JAPS' WHERE id=ready; EXCEPTION WHEN raise_exception THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Registered order was rerouted'; END IF;
  UPDATE receiving_items SET counted=10 WHERE carton_id=pending_box;
  UPDATE receiving_cartons SET counted_at=now(),counted_by=actor WHERE id=pending_box;
  UPDATE receiving_sessions SET status='CLOSED' WHERE id=receipt;
  IF NOT EXISTS(SELECT 1 FROM origin_qa_pending WHERE id=receipt::text AND kind='RECEIVING') THEN RAISE EXCEPTION 'Remaining receipt registration missing'; END IF;
  SELECT count(*) INTO n FROM receiving_cartons b WHERE b.session_id=receipt AND NOT EXISTS(SELECT 1 FROM receiving_origin_registrations r WHERE r.carton_id=b.id);
  IF n<>1 THEN RAISE EXCEPTION 'Bulk would include previously registered cartons'; END IF;
  blocked:=false;BEGIN INSERT INTO receiving_origin_registrations SELECT * FROM receiving_origin_registrations WHERE carton_id=box; EXCEPTION WHEN unique_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Duplicate registration allowed'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='QA passed: fixture rollback';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
END $$;
