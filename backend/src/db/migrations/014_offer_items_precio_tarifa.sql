-- offer_items guarda tambien el precio de TARIFA del ERP.
--
-- Por que hace falta: la 013 guardaba solo `precio_unidad`. Con eso bastaba
-- mientras el documento ensenaba dos importes, pero ahora el listado ensena
-- tambien el precio POR KILO de los articulos que se facturan asi, y de un
-- precio de unidad no se puede recuperar el de kilo: 148,23 de un jamon de
-- 5,5 kg vendria de 26,95, pero la division no tiene por que ser exacta y
-- reconstruir un importe dividiendo es como se acaba con un centimo de baile.
--
-- `precio_tarifa` es el precio_vta del ERP tal cual: por kilo si la unidad es K,
-- por unidad si es U. Con eso mas peso_neto, unidades_caja y dto_pct, la funcion
-- calcularLinea reproduce las seis cifras del documento clavadas, hoy y dentro
-- de tres anos.
--
-- Idempotente porque migrate.js reejecuta todos los ficheros en cada despliegue.

ALTER TABLE offer_items ADD COLUMN IF NOT EXISTS precio_tarifa NUMERIC(14,4);

-- Las filas que existan de antes (solo pruebas locales: esta utilidad no ha
-- llegado a produccion) se rellenan con el precio de unidad, que es correcto
-- para los articulos en unidades y lo unico que se puede saber de los de kilos.
UPDATE offer_items SET precio_tarifa = precio_unidad WHERE precio_tarifa IS NULL;
