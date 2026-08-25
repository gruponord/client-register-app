-- erp.vendedores.movilidad_prev pasa de BIGINT a BOOLEAN.
--
-- Por que hace falta esta migracion: la 009 creo la columna como BIGINT porque
-- el trabajo del agente declaraba `movilidad_prev: { tipo: 'entero' }`. Un
-- SELECT DISTINCT sobre el ERP demostro despues que solo tiene NULL (30), -1
-- (57) y 0 (51): es el booleano de Access, no una cantidad. Al corregir el tipo
-- en el trabajo, el agente empezo a enviar true/false a una columna BIGINT y se
-- rechazaron 108 de las 138 filas con
--
--   invalid input syntax for type bigint: "false"
--
-- Es el caso que describe el §6 del contrato: un cambio de tipo declarado en un
-- trabajo es un cambio de esquema en el destino y se coordina antes de soltarlo.
-- Aqui se solto sin coordinar y esto es el remiendo.
--
-- Merece la pena recordar como se vio, porque no se vio por donde parecia: los
-- dos checksums seguian cuadrando con 108 filas ausentes (el agente calcula el
-- suyo sobre su estado confirmado, que tampoco las incluye), asi que la
-- auto-reparacion no podia detectarlo. Lo cogio el contador de rechazos
-- repetidos del agente.
--
-- La conversion es segura: las 30 filas que hay son las que traen NULL, asi que
-- el USING no convierte ni un valor. `movilidad_prev <> 0` deja NULL como NULL,
-- -1 como true y 0 como false, que es la normalizacion del propio agente.
--
-- La guarda del DO no es decorativa: migrate.js reejecuta TODOS los ficheros en
-- cada despliegue, y un segundo ALTER sobre la columna ya booleana falla (no
-- existe el operador boolean <> integer) y abortaria las migraciones enteras.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'erp'
       AND table_name   = 'vendedores'
       AND column_name  = 'movilidad_prev'
       AND data_type   <> 'boolean'
  ) THEN
    ALTER TABLE erp.vendedores
      ALTER COLUMN movilidad_prev TYPE BOOLEAN USING (movilidad_prev <> 0);
    RAISE NOTICE 'erp.vendedores.movilidad_prev convertida a BOOLEAN';
  ELSE
    RAISE NOTICE 'erp.vendedores.movilidad_prev ya era BOOLEAN, no se toca';
  END IF;
END $$;
