-- Run on an isolated Neon branch. The inner test rolls back its own fixtures.
DO $$
DECLARE u uuid; p uuid; b uuid; o uuid; c uuid; s1 uuid; s2 uuid; n int;
BEGIN
 SELECT id INTO u FROM users WHERE role='MASTER' LIMIT 1;
 SELECT id INTO p FROM products WHERE status='ACTIVE' LIMIT 1;
 SELECT id INTO b FROM branches WHERE name='Treviño' LIMIT 1;
 BEGIN
 INSERT INTO receiving_sessions(branch_id,reference,arrival_date,total_boxes,created_by) VALUES(b,'TEST recepción 9 cajas',current_date,9,u) RETURNING id INTO s1;
 INSERT INTO receiving_sessions(branch_id,reference,arrival_date,total_boxes,created_by) VALUES(b,'TEST recepción pendiente',current_date,1,u) RETURNING id INTO s2;
 INSERT INTO receiving_orders(branch_id,reference,product_id,shipping,marking,created_by) VALUES(b,'TEST-PEDIDO',p,'AIR','PER',u) RETURNING id INTO o;
 FOR n IN 1..10 LOOP
 INSERT INTO receiving_cartons(order_id,carton_number,session_id) VALUES(o,n::text,CASE WHEN n<10 THEN s1 ELSE NULL END) RETURNING id INTO c;
 INSERT INTO receiving_items(carton_id,model,color,expected) VALUES(c,'SAM A57','NEGRO',60);
 END LOOP;
 IF (SELECT count(*) FROM receiving_cartons WHERE order_id=o AND session_id IS NULL)<>1 THEN RAISE EXCEPTION 'Pending cartons incorrect'; END IF;
 IF EXISTS(SELECT 1 FROM receiving_items l JOIN receiving_cartons c ON c.id=l.carton_id WHERE c.order_id=o AND l.counted IS NOT NULL) THEN RAISE EXCEPTION 'Blind count was prefilled'; END IF;
 UPDATE receiving_cartons SET session_id=s2 WHERE order_id=o AND session_id IS NULL;
 IF (SELECT count(DISTINCT order_id) FROM receiving_cartons WHERE session_id IN(s1,s2))<>1 THEN RAISE EXCEPTION 'Order mixed across receipts'; END IF;
 BEGIN
 INSERT INTO receiving_cartons(order_id,carton_number) VALUES(o,'1');
 RAISE EXCEPTION 'Duplicate carton accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 UPDATE receiving_items SET counted=0 WHERE carton_id=c;
 IF (SELECT counted FROM receiving_items WHERE carton_id=c)<>0 THEN RAISE EXCEPTION 'Zero count lost'; END IF;
 BEGIN
 UPDATE receiving_items SET counted=-1 WHERE carton_id=c;
 RAISE EXCEPTION 'Negative quantity accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 RAISE EXCEPTION USING ERRCODE='P9999', MESSAGE='All test fixtures rolled back';
 EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
 END;
END $$;
