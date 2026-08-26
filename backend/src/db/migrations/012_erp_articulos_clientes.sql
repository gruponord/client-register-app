-- erp.articulos y erp.clientes: los dos ultimos datasets de la replica.
--
-- Adaptado de "Sincronizador GNP/receptor-referencia/esquema.sql", generado por
-- el agente desde sus trabajos. Como en la 011, solo se cambia la forma
-- (prefijo ix_erp_* en los indices).
--
-- Columnas que parecen booleanas y NO lo son, resueltas con SELECT DISTINCT
-- sobre el ERP antes de crear las tablas:
--   clientes.tipo_fact                              vale 1, 2, 3 y 4
--   articulos.unidades_agrup, cajas_base, cajas_palet   son cantidades
-- Los booleanos de verdad son estado, fact_email, ibee y puntoverde en
-- clientes, y envase, especial y quitar_catalogo en articulos.

-- ---------------------------------------------------------------------------
-- erp.articulos — 7.448 filas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.articulos (
  empresa_id       TEXT         NOT NULL,
  articulo_id      TEXT         NOT NULL,

  descripcion      TEXT,
  familia_id       TEXT,
  subfamilia_id    TEXT,
  marca_id         TEXT,
  artgen_id        TEXT,
  tipoart_id       TEXT,
  tiporepart_id    TEXT,
  formato_id       TEXT,
  proveedor_id     TEXT,
  iva_id           TEXT,
  unidad_prin_id   TEXT,
  -- Cantidades, no flags.
  unidades_agrup   BIGINT,
  cajas_base       BIGINT,
  cajas_palet      BIGINT,
  codenvase_id     TEXT,
  pv_id            TEXT,
  -- NUMERIC sin precision: el agente los envia como cadena con escala fija 4.
  peso_neto        NUMERIC,
  peso_bruto       NUMERIC,
  litros           NUMERIC,
  web_fam_id       TEXT,
  web_sfam_id      TEXT,
  foto_url         TEXT,
  envase           BOOLEAN,
  especial         BOOLEAN,
  quitar_catalogo  BOOLEAN,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, articulo_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_articulos_clave
  ON erp.articulos (sync_clave COLLATE "C");

-- ---------------------------------------------------------------------------
-- erp.clientes — 35.268 filas
--
-- ⚠️ DATOS PERSONALES. Esta tabla lleva nombre, NIF, domicilio, poblacion,
-- telefono indirecto y dos correos de 35.268 clientes, en un servidor con cara
-- a internet. Esta justificado en una aplicacion de alta de clientes, pero
-- impone dos reglas a quien escriba consultas contra ella:
--
--   1. Nunca un SELECT * hacia una respuesta de API. Se enumeran las columnas
--      que la pantalla necesita y solo esas.
--   2. Nunca estas columnas en un log, ni en un mensaje de error, ni en una
--      exportacion que no lo pida explicitamente.
--
-- El receptor cumple las dos por construccion: lo unico que registra de una
-- fila rechazada es su clave natural (empresa_id, cliente_id) y el mensaje de
-- PostgreSQL, y ningun endpoint devuelve filas de esta tabla.
--
-- `estado` es el alta/baja del cliente (true en 28.555 de 35.268). NO se filtra
-- en el receptor: se guardan los 35.268 y se filtra al consultar, como el resto
-- de la replica (CONTRATO-SYNC.md §8).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.clientes (
  empresa_id       TEXT         NOT NULL,
  cliente_id       TEXT         NOT NULL,

  nombre           TEXT,
  nif              TEXT,
  per_fiscal       TEXT,
  domicilio        TEXT,
  cod_postal       TEXT,
  poblacion        TEXT,
  provincia_id     TEXT,
  pais_id          TEXT,
  email            TEXT,
  email_factura    TEXT,
  clase_id         TEXT,
  grpclte_id       TEXT,
  secpref_id       TEXT,
  tarifa           TEXT,
  logistraz        TEXT,
  -- Vale 1, 2, 3 y 4: es un codigo, no un si/no.
  tipo_fact        BIGINT,
  coment_reparto   TEXT,
  coment_vendedor  TEXT,
  coment_barril    TEXT,
  estado           BOOLEAN,
  fact_email       BOOLEAN,
  ibee             BOOLEAN,
  puntoverde       BOOLEAN,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_clientes_clave
  ON erp.clientes (sync_clave COLLATE "C");
