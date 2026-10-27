DO $test$
DECLARE first_box record; second_box record; actor uuid; amount integer;
BEGIN
 SELECT b.id,b.order_id,b.session_id,s.branch_id origin,o.destination_branch_id destination
 INTO first_box FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id
 JOIN receiving_sessions s ON s.id=b.session_id WHERE o.marking='JAPS' ORDER BY b.id LIMIT 1;
 SELECT b.id,b.order_id,b.session_id,s.branch_id origin,o.destination_branch_id destination
 INTO second_box FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id
 JOIN receiving_sessions s ON s.id=b.session_id WHERE o.marking='JAPS' AND b.id<>first_box.id ORDER BY b.id LIMIT 1;
 SELECT created_by INTO actor FROM receiving_orders WHERE id=first_box.order_id;
 IF first_box.id IS NULL OR second_box.id IS NULL THEN RAISE EXCEPTION 'Missing test fixtures'; END IF;
 BEGIN
  INSERT INTO receiving_destination_arrivals(carton_id,order_id,branch_id,origin_session_id,origin_branch_id,received_by)
  VALUES(first_box.id,first_box.order_id,first_box.destination,first_box.session_id,first_box.origin,actor);
  BEGIN
   INSERT INTO receiving_destination_arrivals(carton_id,order_id,branch_id,origin_session_id,origin_branch_id,received_by)
   VALUES(first_box.id,first_box.order_id,first_box.destination,first_box.session_id,first_box.origin,actor);
   RAISE EXCEPTION 'Duplicate incorrectly allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
   INSERT INTO receiving_destination_arrivals(carton_id,order_id,branch_id,origin_session_id,origin_branch_id,received_by)
   VALUES(second_box.id,second_box.order_id,first_box.origin,second_box.session_id,second_box.origin,actor);
   RAISE EXCEPTION 'Wrong destination incorrectly allowed';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
  INSERT INTO receiving_destination_arrivals(carton_id,order_id,branch_id,origin_session_id,origin_branch_id,received_by)
  VALUES(second_box.id,second_box.order_id,second_box.destination,second_box.session_id,second_box.origin,actor);
  SELECT count(*) INTO amount FROM receiving_destination_arrivals WHERE order_id=first_box.order_id;
  IF amount<>2 THEN RAISE EXCEPTION 'Partial arrival not equal to two'; END IF;
  BEGIN
   UPDATE receiving_orders SET destination_branch_id=first_box.origin WHERE id=first_box.order_id;
   RAISE EXCEPTION 'Confirmed destination changed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='Rollback test fixtures';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END;
END $test$
