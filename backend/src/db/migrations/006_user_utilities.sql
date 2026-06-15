-- Permisos por utilidad a nivel de usuario.
-- 'utilities' guarda los codigos de las utilidades que el usuario puede usar
-- (p.ej. ["altas","prospecting"]). El rol admin ignora esta lista y ve todo.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS utilities JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Migracion de datos: a los usuarios ya existentes les damos acceso a las
-- dos utilidades actuales para no romper su flujo (admins ignoran esto).
UPDATE users
SET utilities = '["altas","prospecting"]'::jsonb
WHERE utilities = '[]'::jsonb;
