-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  full_name VARCHAR(100),
  role VARCHAR(20) DEFAULT 'comercial' CHECK(role IN ('admin', 'comercial')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de plantas
CREATE TABLE IF NOT EXISTS plants (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emails de planta
CREATE TABLE IF NOT EXISTS plant_emails (
  id SERIAL PRIMARY KEY,
  plant_id INT REFERENCES plants(id) ON DELETE CASCADE,
  email VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plant_id, email)
);

-- Comerciales
CREATE TABLE IF NOT EXISTS commercials (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Acciones de cliente
CREATE TABLE IF NOT EXISTS client_actions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clases de cliente
CREATE TABLE IF NOT EXISTS client_classes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tipos de facturación
CREATE TABLE IF NOT EXISTS billing_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Formas de pago
CREATE TABLE IF NOT EXISTS payment_methods (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Periodos de visita
CREATE TABLE IF NOT EXISTS visit_periods (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submissions (altas de cliente)
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  plant_id INT REFERENCES plants(id),
  commercial_id INT REFERENCES commercials(id),
  client_action_id INT REFERENCES client_actions(id),
  client_code VARCHAR(50),
  group_code VARCHAR(50),
  previous_code VARCHAR(50),
  point_of_sale VARCHAR(100),
  commercial_name VARCHAR(40) NOT NULL,
  economic_segmentation CHAR(1) CHECK(economic_segmentation IN ('A','B','C','D')),
  business_name VARCHAR(40) NOT NULL,
  nif_cif VARCHAR(20) NOT NULL,
  street_address VARCHAR(40) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  city VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  contact_email VARCHAR(40) NOT NULL,
  billing_email VARCHAR(40) NOT NULL,
  client_class_id INT REFERENCES client_classes(id),
  billing_type_id INT REFERENCES billing_types(id),
  payment_method_id INT REFERENCES payment_methods(id),
  visit_days VARCHAR(50) NOT NULL,
  client_position VARCHAR(50) NOT NULL,
  visit_period_id INT REFERENCES visit_periods(id),
  telesales BOOLEAN NOT NULL,
  barrel_client BOOLEAN NOT NULL,
  delivery_days VARCHAR(50) NOT NULL,
  delivery_time_start TIME NOT NULL,
  delivery_time_end TIME NOT NULL,
  rest_days VARCHAR(80) NOT NULL,
  morning_order BOOLEAN NOT NULL,
  observations TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ficheros adjuntos
CREATE TABLE IF NOT EXISTS submission_files (
  id SERIAL PRIMARY KEY,
  submission_id INT REFERENCES submissions(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log de auditoría
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id INT,
  old_value JSONB,
  new_value JSONB,
  ip VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_submissions_plant ON submissions(plant_id);
CREATE INDEX IF NOT EXISTS idx_submissions_commercial ON submissions(commercial_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
