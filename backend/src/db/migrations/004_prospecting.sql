-- =============================================
-- Migración 004: Prospección de cliente de cerveza
-- =============================================

-- Tablas maestras para prospección
-- (mismo esquema que las existentes: id, code, name, active, created_at)

CREATE TABLE IF NOT EXISTS beer_brands (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barrel_volumes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barrel_discount_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS improvement_points (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interest_brands (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposal_priorities (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emails de prospección por planta (separados de los de altas)
CREATE TABLE IF NOT EXISTS plant_prospecting_emails (
  id SERIAL PRIMARY KEY,
  plant_id INT REFERENCES plants(id) ON DELETE CASCADE,
  email VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plant_id, email)
);

-- Tabla principal de prospecciones
CREATE TABLE IF NOT EXISTS prospecting_submissions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  plant_id INT REFERENCES plants(id),
  client_code VARCHAR(10),
  client_name VARCHAR(40) NOT NULL,
  address VARCHAR(40) NOT NULL,
  contact_person VARCHAR(40) NOT NULL,
  contact_phone VARCHAR(40) NOT NULL,
  call_schedule VARCHAR(40) NOT NULL,
  current_brands JSONB NOT NULL,
  other_brands_text VARCHAR(200),
  contract_type_id INT REFERENCES contract_types(id),
  barrel_volume_id INT REFERENCES barrel_volumes(id),
  barrel_discount_type_id INT REFERENCES barrel_discount_types(id),
  service_rating SMALLINT CHECK(service_rating >= 1 AND service_rating <= 5),
  improvement_points JSONB NOT NULL,
  interest_brands JSONB NOT NULL,
  proposal_priorities JSONB NOT NULL,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ficheros adjuntos de prospección
CREATE TABLE IF NOT EXISTS prospecting_files (
  id SERIAL PRIMARY KEY,
  prospecting_id INT REFERENCES prospecting_submissions(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prospecting_plant ON prospecting_submissions(plant_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_user ON prospecting_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_created ON prospecting_submissions(created_at);

-- Seeds: Marcas actuales de cerveza
INSERT INTO beer_brands (code, name) VALUES
  ('MAH', 'Mahou'),
  ('EDA', 'Estrella Damm'),
  ('EGA', 'Estrella Galicia'),
  ('HEI', 'Heineken'),
  ('CRU', 'Cruzcampo'),
  ('SMI', 'San Miguel'),
  ('ALH', 'Alhambra'),
  ('AMS', 'Amstel'),
  ('OTR', 'Otras marcas (escribir cuál)')
ON CONFLICT (code) DO NOTHING;

-- Seeds: Tipos de contrato
INSERT INTO contract_types (code, name) VALUES
  ('LIB', 'Sin contrato / libre'),
  ('ANT', 'Anticipo (€ por adelantado)'),
  ('PER', 'Permanencia por consumo de litros'),
  ('NOS', 'No lo sabe / no quiere decir')
ON CONFLICT (code) DO NOTHING;

-- Seeds: Volúmenes de barril
INSERT INTO barrel_volumes (code, name) VALUES
  ('V01', 'Menos de 500 litros'),
  ('V02', '500 – 1.500 litros'),
  ('V03', '1.500 – 3.000 litros'),
  ('V04', 'Más de 3.000 litros')
ON CONFLICT (code) DO NOTHING;

-- Seeds: Tipos de descuento en barril
INSERT INTO barrel_discount_types (code, name) VALUES
  ('DIR', 'Descuento directo en factura'),
  ('RAP', 'Rappel (devolución posterior)'),
  ('SIN', 'Sin descuento'),
  ('NOS', 'No sabe / no dice')
ON CONFLICT (code) DO NOTHING;

-- Seeds: Puntos de mejora
INSERT INTO improvement_points (code, name) VALUES
  ('PRE', 'Precio alto'),
  ('STE', 'Servicio técnico malo'),
  ('REP', 'Problemas de reparto'),
  ('VIS', 'No le visitan'),
  ('ATE', 'Atención deficiente'),
  ('CAL', 'Calidad de la cerveza')
ON CONFLICT (code) DO NOTHING;

-- Seeds: Marcas de interés nuestras
INSERT INTO interest_brands (code, name) VALUES
  ('SAL', 'La Salve'),
  ('SMI', 'San Miguel'),
  ('ALH', 'Alhambra'),
  ('STE', 'Stella Artois'),
  ('NOI', 'No está interesado')
ON CONFLICT (code) DO NOTHING;

-- Seeds: Prioridades de propuesta
INSERT INTO proposal_priorities (code, name) VALUES
  ('PRE', 'Precio'),
  ('STE', 'Servicio técnico'),
  ('REP', 'Reparto y disponibilidad'),
  ('APO', 'Aportación / incentivo'),
  ('MAR', 'Prestigio de la marca'),
  ('VIS', 'Visitas comerciales')
ON CONFLICT (code) DO NOTHING;
