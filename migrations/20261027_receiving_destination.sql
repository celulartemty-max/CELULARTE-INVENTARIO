-- Additive foundation for branch-specific custody. Physical origin is never moved.
ALTER TABLE receiving_orders ADD COLUMN supplier text NOT NULL DEFAULT '' CHECK(length(supplier)<=160);
ALTER TABLE receiving_orders ADD COLUMN destination_branch_id uuid REFERENCES branches(id);
CREATE TABLE receiving_order_routing_backup (
 order_id uuid PRIMARY KEY REFERENCES receiving_orders(id),
 previous_marking text NOT NULL, previous_is_foreign boolean NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO receiving_order_routing_backup(order_id,previous_marking,previous_is_foreign)
 SELECT id,marking,is_foreign FROM receiving_orders;
-- Only recognized leading codes are normalized. Supplier suffixes remain recoverable.
UPDATE receiving_orders SET
 supplier=trim(substring(trim(marking) FROM '^[^[:space:]]+[[:space:]]+(.*)$')),
 marking=upper(split_part(trim(marking),' ',1))
 WHERE trim(marking) ~* '^(PER|JAPS|GAL|AD|JAPU|JACG|ASL|MCFE)[[:space:]]+'
 AND supplier='';
UPDATE receiving_orders SET supplier='' WHERE supplier IS NULL;
UPDATE receiving_orders o SET destination_branch_id=b.id FROM branches b
 WHERE b.status='ACTIVE' AND ((o.marking='PER' AND b.name='Treviño') OR (o.marking='JAPS' AND b.name='Plaza del Audio'));
-- Unknown historical labels must be reviewed. New writes use only these eight codes.
ALTER TABLE receiving_orders ADD CONSTRAINT receiving_orders_shipping_mark_codes
 CHECK(marking IN ('PER','JAPS','GAL','AD','JAPU','JACG','ASL','MCFE')) NOT VALID;
CREATE UNIQUE INDEX receiving_orders_id_destination ON receiving_orders(id,destination_branch_id);
CREATE UNIQUE INDEX receiving_cartons_id_order ON receiving_cartons(id,order_id);
CREATE UNIQUE INDEX receiving_cartons_id_session ON receiving_cartons(id,session_id);
CREATE UNIQUE INDEX receiving_sessions_id_branch ON receiving_sessions(id,branch_id);
CREATE TABLE receiving_destination_arrivals (
 carton_id uuid PRIMARY KEY,
 order_id uuid NOT NULL,
 branch_id uuid NOT NULL REFERENCES branches(id),
 origin_session_id uuid NOT NULL,
 origin_branch_id uuid NOT NULL,
 received_by uuid NOT NULL REFERENCES users(id),
 received_at timestamptz NOT NULL DEFAULT now(),
 CHECK(branch_id<>origin_branch_id),
 FOREIGN KEY(carton_id,order_id) REFERENCES receiving_cartons(id,order_id),
 FOREIGN KEY(carton_id,origin_session_id) REFERENCES receiving_cartons(id,session_id),
 FOREIGN KEY(order_id,branch_id) REFERENCES receiving_orders(id,destination_branch_id),
 FOREIGN KEY(origin_session_id,origin_branch_id) REFERENCES receiving_sessions(id,branch_id)
);
CREATE INDEX receiving_destination_arrivals_branch ON receiving_destination_arrivals(branch_id,received_at);
