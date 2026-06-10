-- =============================================
-- Migración 005: Cambios en formulario de prospección
-- - Nueva tabla maestra free_barrels_options
-- - Nueva columna free_barrels_id en prospecting_submissions
-- - Relajar NOT NULL en improvement_points (ya no se pide en el formulario,
--   pero la columna se conserva para no perder datos históricos)
-- =============================================

CREATE TABLE IF NOT EXISTS free_barrels_options (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO free_barrels_options (code, name) VALUES
  ('NO',  'No'),
  ('06',  '0-6 al año'),
  ('12',  '12 al año'),
  ('M12', 'Más de 12 al año')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE prospecting_submissions
  ADD COLUMN IF NOT EXISTS free_barrels_id INT REFERENCES free_barrels_options(id);

ALTER TABLE prospecting_submissions
  ALTER COLUMN improvement_points DROP NOT NULL;
