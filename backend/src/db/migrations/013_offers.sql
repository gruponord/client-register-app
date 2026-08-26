-- Utilidad "Generador de Ofertas".
--
-- El vendedor elige un cliente (de la replica del ERP o escrito a mano), monta
-- una lista de articulos con su precio y descuento, y genera un PDF con el
-- logotipo de su planta.
--
-- Estas tablas son de la APP, no de la replica: van fuera del esquema `erp`,
-- que lo sobrescribe el agente del sincronizador. Se referencian los datos del
-- ERP por su clave natural y SIN claves foraneas contra `erp`: los datasets
-- tienen cadencias distintas y un huerfano temporal es normal.

-- ---------------------------------------------------------------------------
-- Logotipo por planta, para la cabecera del PDF
-- ---------------------------------------------------------------------------
ALTER TABLE plants ADD COLUMN IF NOT EXISTS logo_path VARCHAR(255);

-- plants.code ya coincide con erp.secciones.seccion_id (M, N, Y, Z), asi que
-- el nombre del fichero es el propio codigo.
UPDATE plants SET logo_path = code || '.jpg'
 WHERE code IN ('M', 'N', 'Y', 'Z') AND logo_path IS NULL;

-- ---------------------------------------------------------------------------
-- offers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(id),

  -- Con que planta y como que vendedor del ERP se emitio. Se guardan aunque
  -- despues cambie la asignacion del usuario: la oferta es un hecho pasado.
  seccion_id     VARCHAR(4) NOT NULL,
  vendedor_id    VARCHAR(8),
  vendedor_nombre VARCHAR(80),

  -- Cliente de la replica: los dos codigos, sin FK contra erp.
  -- Cliente nuevo: solo el nombre y la poblacion que escriba el vendedor.
  cliente_id     VARCHAR(20),
  local_id       VARCHAR(20),
  cliente_nombre VARCHAR(200) NOT NULL,
  cliente_poblacion VARCHAR(120),
  es_nuevo       BOOLEAN NOT NULL DEFAULT false,

  pdf_path       VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un cliente nuevo no tiene codigo; uno de la replica siempre lo tiene.
  CONSTRAINT offers_cliente_coherente CHECK (
    (es_nuevo = true  AND cliente_id IS NULL) OR
    (es_nuevo = false AND cliente_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_offers_user ON offers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_offers_seccion ON offers (seccion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_offers_cliente ON offers (cliente_id);

-- ---------------------------------------------------------------------------
-- offer_items
--
-- Todo lo del articulo se guarda CONGELADO. El precio del ERP cambia cada
-- noche y un PDF entregado en mano no puede cambiar con el: si dentro de tres
-- meses alguien consulta la oferta desde admin, tiene que ver el precio que se
-- ofrecio, no el de hoy. Por eso aqui se duplica la descripcion y el precio en
-- vez de leerlos de la replica al consultar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offer_items (
  id             SERIAL PRIMARY KEY,
  offer_id       INT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,

  articulo_id    VARCHAR(25) NOT NULL,
  descripcion    VARCHAR(120) NOT NULL,

  -- 'U' o 'K'. En kilos, el precio es POR KILO y la unidad pesa peso_neto.
  unidad         VARCHAR(4),
  peso_neto      NUMERIC(14,4),
  unidades_caja  INT,

  precio_unidad  NUMERIC(14,4) NOT NULL,   -- precio_vta del ERP, congelado
  dto_pct        NUMERIC(6,2) NOT NULL DEFAULT 0,
  dto_editado    BOOLEAN NOT NULL DEFAULT false,  -- para auditar quien lo toco

  orden          INT NOT NULL DEFAULT 0,

  UNIQUE (offer_id, articulo_id)
);

CREATE INDEX IF NOT EXISTS ix_offer_items_offer ON offer_items (offer_id, orden);
