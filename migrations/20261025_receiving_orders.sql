-- Additive rollout: legacy receptions and TikTok are intentionally untouched.
CREATE TABLE receiving_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id),
 reference text NOT NULL, arrival_date date NOT NULL, total_boxes integer NOT NULL CHECK(total_boxes BETWEEN 1 AND 1000),
 cost numeric(14,2) CHECK(cost>=0), currency text NOT NULL DEFAULT 'MXN' CHECK(currency IN ('MXN','USD','CNY')),
 notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','CLOSED','POS_REGISTERED')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE receiving_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id),
 reference text NOT NULL, product_id uuid NOT NULL REFERENCES products(id), shipping text NOT NULL CHECK(shipping IN ('SEA','AIR')),
 marking text NOT NULL CHECK(marking IN ('JAPS','PER')), created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX receiving_orders_reference ON receiving_orders(branch_id,lower(reference));
CREATE TABLE receiving_cartons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES receiving_orders(id),
 carton_number text NOT NULL, session_id uuid REFERENCES receiving_sessions(id),
 counted_at timestamptz, counted_by uuid REFERENCES users(id), notes text NOT NULL DEFAULT '',
 UNIQUE(order_id,carton_number)
);
CREATE TABLE receiving_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carton_id uuid NOT NULL REFERENCES receiving_cartons(id),
 model text NOT NULL DEFAULT '', color text NOT NULL DEFAULT '', expected integer CHECK(expected>=0),
 counted integer CHECK(counted>=0), UNIQUE(carton_id,model,color)
);
CREATE TABLE receiving_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES receiving_orders(id), session_id uuid REFERENCES receiving_sessions(id),
 filename text NOT NULL, mime text NOT NULL, data bytea NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK((order_id IS NOT NULL)::int+(session_id IS NOT NULL)::int=1)
);
CREATE TABLE receiving_ai_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), success boolean NOT NULL DEFAULT false
);
CREATE INDEX receiving_cartons_session ON receiving_cartons(session_id);
CREATE INDEX receiving_items_carton ON receiving_items(carton_id);
