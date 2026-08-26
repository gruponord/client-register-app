-- El listado lleva en la cabecera el correo de quien lo emite.
--
-- Se llama `emisor_email` y no `vendedor_email` porque no siempre hay un
-- vendedor detras: un usuario sin ficha en el ERP tambien emite listados, y
-- entonces la cabecera lleva solo el correo, sin nombre.
--
-- Se guarda en la oferta en vez de leerlo de `users` al imprimir, por lo mismo
-- que el nombre del vendedor y los precios: el documento tiene que reproducirse
-- tal y como se entrego. Si manana esa persona cambia de correo, un listado de
-- hace tres meses debe seguir diciendo la direccion que el cliente recibio.

ALTER TABLE offers ADD COLUMN IF NOT EXISTS emisor_email VARCHAR(120);

-- Las filas anteriores (solo pruebas locales: esto no ha llegado a produccion)
-- se rellenan con el correo actual del usuario, que es lo unico que se sabe.
UPDATE offers o
   SET emisor_email = u.email
  FROM users u
 WHERE u.id = o.user_id AND o.emisor_email IS NULL;
