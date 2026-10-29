-- Isolated test branch only. Fixtures and their audit rows roll back together.
DO $$
DECLARE actor uuid; branch uuid; product uuid; movement uuid; line uuid; n integer;
BEGIN
  SELECT id INTO branch FROM branches WHERE name='Treviño';
  BEGIN
    INSERT INTO users(name,email,role) VALUES('RETURN COLOUR FIXTURE',gen_random_uuid()||'@fixture.invalid','MASTER') RETURNING id INTO actor;
    PERFORM set_config('app.audit_user_id',actor::text,true);
    INSERT INTO products(name) VALUES('RETURN COLOUR FIXTURE '||gen_random_uuid()) RETURNING id INTO product;
    INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by) VALUES('RETURN-TEST-'||gen_random_uuid(),'RETURN_ML',branch,actor) RETURNING id INTO movement;
    INSERT INTO return_headers(movement_id) VALUES(movement);
    INSERT INTO return_lines(movement_id,product_id,color_id,model_reference,quantity,condition,return_reason) VALUES(movement,product,NULL,'N/A',4,'GOOD','') RETURNING id INTO line;
    SELECT count(*) INTO n FROM return_lines l JOIN products p ON p.id=l.product_id LEFT JOIN product_colors c ON c.id=l.color_id WHERE l.id=line AND l.color_id IS NULL AND l.quantity=4;
    IF n<>1 THEN RAISE EXCEPTION 'Colourless return missing from details'; END IF;
    IF EXISTS(SELECT 1 FROM product_colors WHERE product_id=product) THEN RAISE EXCEPTION 'Unexpected catalogue colour'; END IF;
    IF NOT EXISTS(SELECT 1 FROM audit_events WHERE entity_id=line AND user_id=actor AND action='ROW_INSERT') THEN RAISE EXCEPTION 'Missing audit actor'; END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='fixture passed, rollback';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $$;
