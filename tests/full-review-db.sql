-- Synthetic fixtures: run ONLY on isolated test branch, never production.
DO $$
DECLARE actor uuid; prod uuid; plaza uuid; trevino uuid; oid uuid; mid uuid; lid uuid; rid uuid; rlid uuid; batch uuid; n int; total int; lineids uuid[]:='{}';
BEGIN
 SELECT id INTO actor FROM users WHERE role::text='MASTER' LIMIT 1;
 SELECT id INTO prod FROM products WHERE status::text='ACTIVE' LIMIT 1;
 SELECT id INTO plaza FROM branches WHERE name='Plaza del Audio';
 SELECT id INTO trevino FROM branches WHERE name='Treviño';
 FOR n IN 1..3 LOOP
  INSERT INTO full_orders(reference,title,created_by) VALUES('TEST-REVIEW-'||gen_random_uuid(),'Prueba aislada devolución',actor) RETURNING id INTO oid;
  INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by,status) VALUES('TEST-'||gen_random_uuid(),'EXIT',plaza,actor,'CLOSED') RETURNING id INTO mid;
  INSERT INTO exits(movement_id,channel,exit_type) VALUES(mid,'MERCADO_LIBRE','FULL');
  INSERT INTO full_order_exits(order_id,branch_id,movement_id) VALUES(oid,plaza,mid);
  INSERT INTO exit_lines(movement_id,product_id,quantity) VALUES(mid,prod,100) RETURNING id INTO lid;
  INSERT INTO full_exit_reviews(movement_id,order_id,source_branch_id,holding_branch_id,reviewed_by) VALUES(mid,oid,plaza,trevino,actor) RETURNING id INTO rid;
  INSERT INTO full_review_lines(review_id,original_line_id,product_id,sent,accepted,detail) VALUES(rid,lid,prod,100,80,'Modelo equivocado negro') RETURNING id INTO rlid;
  lineids:=array_append(lineids,rlid);
  UPDATE exit_lines SET quantity=80 WHERE id=lid;
  IF n=1 THEN
   INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by) VALUES('TEST-'||gen_random_uuid(),'EXIT',trevino,actor) RETURNING id INTO mid;
   INSERT INTO exits(movement_id,channel,exit_type) VALUES(mid,'MERCADO_LIBRE','FULL');
   INSERT INTO full_order_exits(order_id,branch_id,movement_id) VALUES(oid,trevino,mid);
   INSERT INTO exit_lines(movement_id,product_id,quantity) VALUES(mid,prod,20);
   SELECT sum(l.quantity)::int INTO total FROM full_order_exits x JOIN exit_lines l ON l.movement_id=x.movement_id WHERE x.order_id=oid;
   IF total<>100 THEN RAISE EXCEPTION '80+20 must equal 100'; END IF;
  END IF;
 END LOOP;
 INSERT INTO full_return_batches(folio,created_by) VALUES('TEST-REGRESO-'||gen_random_uuid(),actor) RETURNING id INTO batch;
 FOR n IN 1..2 LOOP
  INSERT INTO full_return_batch_lines(batch_id,review_line_id,quantity) VALUES(batch,lineids[n],20) RETURNING id INTO lid;
  UPDATE full_return_batch_lines SET received=8 WHERE id=lid;
  INSERT INTO full_return_receipts(batch_line_id,quantity,received_by) VALUES(lid,8,actor);
  BEGIN
   UPDATE full_return_batch_lines SET received=21 WHERE id=lid;
   RAISE EXCEPTION 'Over receipt accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE full_return_batch_lines SET received=received+12 WHERE id=lid;
  INSERT INTO full_return_receipts(batch_line_id,quantity,received_by) VALUES(lid,12,actor);
 END LOOP;
 SELECT sum(quantity)::int INTO total FROM full_return_batch_lines WHERE batch_id=batch;
 IF total<>40 THEN RAISE EXCEPTION 'Mixed return must have 40'; END IF;
 SELECT sum(l.sent-l.accepted-COALESCE(a.n,0))::int INTO total FROM full_review_lines l LEFT JOIN LATERAL(SELECT sum(quantity) n FROM full_return_batch_lines a WHERE a.review_line_id=l.id) a ON true WHERE l.id=ANY(lineids);
 IF total<>20 THEN RAISE EXCEPTION 'Unselected third FULL must remain pending'; END IF;
END $$;
