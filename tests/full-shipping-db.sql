-- Run only on the isolated test branch. Synthetic data, never production.
DO $$
DECLARE actor uuid; product uuid; plaza uuid; trevino uuid; oid uuid; pm uuid; tm uuid; lid uuid; rid uuid; n int;
BEGIN
 SELECT id INTO actor FROM users WHERE role::text='MASTER' LIMIT 1;
 SELECT id INTO product FROM products WHERE status::text='ACTIVE' LIMIT 1;
 SELECT id INTO plaza FROM branches WHERE name='Plaza del Audio';
 SELECT id INTO trevino FROM branches WHERE name='Treviño';
 INSERT INTO full_orders(reference,title,expected_pieces,created_by) VALUES('TEST-SHIP-'||gen_random_uuid(),'Prueba aislada envío',80,actor) RETURNING id INTO oid;
 INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by,status) VALUES('TEST-SHIP-'||gen_random_uuid(),'EXIT',plaza,actor,'CLOSED') RETURNING id INTO pm;
 INSERT INTO exits(movement_id,channel,exit_type) VALUES(pm,'MERCADO_LIBRE','FULL');
 INSERT INTO full_order_exits(order_id,branch_id,movement_id) VALUES(oid,plaza,pm);
 INSERT INTO exit_lines(movement_id,product_id,quantity) VALUES(pm,product,80) RETURNING id INTO lid;
 INSERT INTO full_exit_reviews(movement_id,order_id,source_branch_id,holding_branch_id,reviewed_by) VALUES(pm,oid,plaza,trevino,actor) RETURNING id INTO rid;
 INSERT INTO full_review_lines(review_id,original_line_id,product_id,sent,accepted,detail) VALUES(rid,lid,product,80,80,'');
 INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by) VALUES('TEST-SHIP-'||gen_random_uuid(),'EXIT',trevino,actor) RETURNING id INTO tm;
 INSERT INTO exits(movement_id,channel,exit_type) VALUES(tm,'MERCADO_LIBRE','FULL');
 INSERT INTO full_order_exits(order_id,branch_id,movement_id) VALUES(oid,trevino,tm);
 UPDATE full_order_exits SET waived_at=now(),waived_by=actor WHERE movement_id=tm;
 UPDATE inventory_movements SET status='CANCELLED' WHERE id=tm;
 UPDATE full_orders SET shipped_at=now(),shipped_by=actor WHERE id=oid;
 SELECT sum(l.quantity)::int INTO n FROM full_order_exits x JOIN exit_lines l ON l.movement_id=x.movement_id WHERE x.order_id=oid;
 IF n<>80 THEN RAISE EXCEPTION 'Shipping must not alter quantities'; END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory_movements WHERE id=pm AND status::text='CLOSED' AND pos_registered_at IS NULL) THEN RAISE EXCEPTION 'POS registration must remain pending'; END IF;
 IF NOT EXISTS(SELECT 1 FROM full_orders WHERE id=oid AND shipped_at IS NOT NULL AND shipped_by=actor) THEN RAISE EXCEPTION 'Missing shipping history'; END IF;
 IF NOT EXISTS(SELECT 1 FROM full_order_exits WHERE movement_id=tm AND waived_at IS NOT NULL AND waived_by=actor) THEN RAISE EXCEPTION 'Missing opt-out history'; END IF;
END $$;
