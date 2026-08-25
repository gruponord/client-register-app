-- Permisos del esquema `erp` (CONTRATO-SYNC.md §6).
--
-- NO va en migrations/: CREATE ROLE necesita privilegios que el usuario de la
-- app no tiene, y migrate.js aborta en el primer error. Se ejecuta una vez, a
-- mano, con un superusuario:
--
--   psql -U postgres -d client_register -f src/db/permisos-sync.sql
--
-- El objetivo es que la app no pueda corromper la replica ni por un bug ni por
-- un descuido: el endpoint de sync escribe, la app solo lee.
--
-- Si se deja SIN ejecutar, el receptor funciona igual usando DATABASE_URL
-- (ver src/config/dbSync.js), pero se pierde esa red de seguridad.

-- 1. El rol que escribe: el unico que usa el endpoint de sincronizacion.
--    Cambiar la contrasena y ponerla en SYNC_DATABASE_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sync_writer') THEN
    CREATE ROLE sync_writer LOGIN PASSWORD 'CAMBIAR_ESTA_CONTRASENA';
  END IF;
END $$;

GRANT CONNECT ON DATABASE client_register TO sync_writer;
GRANT USAGE ON SCHEMA erp TO sync_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA erp TO sync_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sync_writer;

-- 2. El usuario de la app: solo lectura sobre la replica.
--    Sustituir `app_user` por el usuario real de DATABASE_URL.
--    REVOKE ademas de no conceder: si ese usuario creo el esquema es su dueno y
--    los GRANT no le quitan nada, hay que quitarselo explicitamente.
-- REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA erp FROM app_user;
-- GRANT USAGE ON SCHEMA erp TO app_user;
-- GRANT SELECT ON ALL TABLES IN SCHEMA erp TO app_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT SELECT ON TABLES TO app_user;

-- 3. Que el dueno del esquema sea sync_writer, para que las tablas nuevas que
--    cree una migracion futura nazcan ya con el reparto correcto.
-- ALTER SCHEMA erp OWNER TO sync_writer;
