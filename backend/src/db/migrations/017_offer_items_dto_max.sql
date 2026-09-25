-- El listado guarda tambien el descuento MAXIMO que regia ese dia.
--
-- `articulos_sec.por_dto` del ERP no es un descuento a aplicar: es el tope que
-- el comercial tiene autorizado para ese articulo. Hasta ahora el receptor lo
-- trataba como si fuera el descuento de tarifa y lo aplicaba solo, asi que los
-- listados salian con el maximo descuento autorizado sin que nadie lo decidiera.
-- A partir de aqui el descuento empieza en 0 y lo sube el comercial.
--
-- Se congela con la linea, por lo mismo que `precio_tarifa`: el tope del ERP
-- cambia, y sin guardarlo nadie podria comprobar despues si un listado de hace
-- tres meses respetaba lo autorizado entonces.
--
-- Idempotente porque migrate.js reejecuta todos los ficheros en cada despliegue.

ALTER TABLE offer_items ADD COLUMN IF NOT EXISTS dto_max NUMERIC(6,2);

-- Las lineas anteriores al cambio: en ellas `dto_pct` ERA el tope, porque se
-- aplicaba automaticamente. Asi que para las que nadie toco a mano, el tope de
-- aquel dia se conoce con certeza y se puede rellenar.
--
-- Las que si se editaron (`dto_editado`) se quedan a NULL a proposito: el valor
-- guardado es el que puso el comercial y el tope de entonces no se puede saber.
-- Mejor un hueco honesto que un dato inventado.
UPDATE offer_items
   SET dto_max = dto_pct
 WHERE dto_max IS NULL AND dto_editado = false;
