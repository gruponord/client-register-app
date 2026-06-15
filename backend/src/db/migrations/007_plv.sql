-- Utilidad "Petición PLV" (Punto de Venta).
-- Cada empresa (delegacion) tiene su propio catalogo de articulos agrupado por
-- grupo (ESTABLECIMIENTO, EVENTOS, ...) y opcionalmente por marca.
-- Los comerciales se asignan a una o varias empresas y solo pueden pedir PLV
-- de las que tengan asignadas.

-- Empresas (delegaciones)
CREATE TABLE IF NOT EXISTS plv_companies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emails destinatarios por empresa (analogo a plant_emails)
CREATE TABLE IF NOT EXISTS plv_company_emails (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES plv_companies(id) ON DELETE CASCADE,
  email VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, email)
);

-- Asignacion usuarios <-> empresas PLV (many-to-many)
CREATE TABLE IF NOT EXISTS plv_user_companies (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INT NOT NULL REFERENCES plv_companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, company_id)
);

-- Maestro global de marcas (SAN MIGUEL, ALHAMBRA, LA SALVE, STELLA, MAGNA, MSM, ...)
CREATE TABLE IF NOT EXISTS plv_brands (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maestro global de grupos (ESTABLECIMIENTO, EVENTOS, ...)
CREATE TABLE IF NOT EXISTS plv_groups (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catalogo de articulos por empresa + grupo. brand_id es opcional
-- (EVENTOS no lleva marca segun el Excel original).
CREATE TABLE IF NOT EXISTS plv_articles (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES plv_companies(id) ON DELETE CASCADE,
  group_id INT NOT NULL REFERENCES plv_groups(id),
  brand_id INT REFERENCES plv_brands(id),
  code VARCHAR(20) NOT NULL,
  description VARCHAR(200) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, code)
);

-- Cabecera de la peticion PLV
CREATE TABLE IF NOT EXISTS plv_submissions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  company_id INT NOT NULL REFERENCES plv_companies(id),
  client_code VARCHAR(20) NOT NULL,
  client_name VARCHAR(100) NOT NULL,
  request_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lineas de la peticion: solo se insertan articulos con unidades > 0
CREATE TABLE IF NOT EXISTS plv_submission_lines (
  id SERIAL PRIMARY KEY,
  submission_id INT NOT NULL REFERENCES plv_submissions(id) ON DELETE CASCADE,
  article_id INT NOT NULL REFERENCES plv_articles(id),
  units INT NOT NULL CHECK (units > 0),
  delivery_date DATE,
  return_date DATE
);

CREATE INDEX IF NOT EXISTS idx_plv_articles_company ON plv_articles(company_id, active);
CREATE INDEX IF NOT EXISTS idx_plv_articles_group   ON plv_articles(group_id);
CREATE INDEX IF NOT EXISTS idx_plv_submissions_user ON plv_submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plv_submissions_company ON plv_submissions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plv_submission_lines_sub ON plv_submission_lines(submission_id);
