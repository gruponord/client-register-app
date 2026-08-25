-- Receptor de datos del ERP (Sincronizador GNP).
--
-- Definicion unica del contrato: "Sincronizador GNP/CONTRATO-SYNC.md".
-- Aqui NO se documenta el protocolo: dos copias de una definicion acaban
-- siendo dos definiciones distintas.
--
-- Todo lo replicado vive en el esquema `erp` y NO pertenece a la app: lo
-- sobrescribe el agente. La app solo lee (§8 del contrato).
--
-- Reglas que se aplican en todas las tablas de replica:
--   - Clave primaria = clave natural del ERP. Nunca un id autonumerico.
--   - Cero claves foraneas entre tablas de replica ni contra tablas de la app:
--     los datasets tienen cadencias distintas y un huerfano temporal es normal.
--   - Bajas logicas (activo = false), nunca DELETE.
--   - Sin columnas propias de la app: un envio completo las dejaria incoherentes.
--
-- Por que TEXT y no VARCHAR(n) en las columnas de negocio, aunque el esquema de
-- referencia del agente use anchos: una tabla de replica NO debe ser mas
-- estricta que su origen. Un ancho corto de mas no protege nada y pierde la
-- fila para siempre, porque el receptor la rechaza en cada ciclo y el checksum
-- NO lo detecta: el agente calcula el suyo sobre su estado confirmado, que
-- tampoco la incluye, asi que las dos puntas cuadran mientras el dato falta. El
-- unico rastro es el "parcial" del informe del agente. En PostgreSQL TEXT y
-- VARCHAR(n) rinden igual, asi que el limite solo compra ese riesgo.
--
-- Si se restringe algo, se restringe lo que garantiza el CONTRATO, no lo que
-- venga del ERP: de ahi que `baja`/`activoreal` sean BOOLEAN (el agente los
-- normaliza a true/false) y `sync_hash` sea VARCHAR(40) (es nuestro SHA-1).
-- Y BIGINT en vez de INTEGER por lo mismo: un desbordamiento tambien rechaza.

CREATE SCHEMA IF NOT EXISTS erp;

-- ---------------------------------------------------------------------------
-- erp.secciones — las delegaciones y sus datos fiscales
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.secciones (
  empresa_id       TEXT         NOT NULL,
  seccion_id       TEXT         NOT NULL,

  nombre           TEXT,
  nif              TEXT,
  domicilio        TEXT,
  codpostal        TEXT,
  poblacion        TEXT,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, seccion_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_secciones_clave
  ON erp.secciones (sync_clave COLLATE "C");

-- ---------------------------------------------------------------------------
-- erp.vendedores — los comerciales del ERP, por seccion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.vendedores (
  empresa_id       TEXT         NOT NULL,
  seccion_id       TEXT         NOT NULL,
  vendedor_id      TEXT         NOT NULL,

  nombre           TEXT,
  email            TEXT,
  zona             TEXT,
  vend_resp_id     TEXT,
  colaborador_id   BIGINT,
  movilidad_prev   BIGINT,
  -- baja       = el vendedor ya no trabaja con nosotros
  -- activoreal = es un vendedor real y no un registro administrativo
  --              (p. ej. "VENTAS DIRECTAS")
  -- Llegan los 138 sin filtrar: el filtro lo hace la app al consultar, nunca
  -- el receptor. Manana otra pantalla puede necesitar los inactivos.
  baja             BOOLEAN,
  activoreal       BOOLEAN,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, seccion_id, vendedor_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_vendedores_clave
  ON erp.vendedores (sync_clave COLLATE "C");

-- ---------------------------------------------------------------------------
-- Control
-- ---------------------------------------------------------------------------

-- Frescura POR DATASET, no global: en el pie de una pantalla debe ir la fecha
-- del dato que se ensena, no la del ultimo sync de cualquier cosa.
CREATE TABLE IF NOT EXISTS erp.datasets (
  dataset          TEXT PRIMARY KEY,
  ultima_ejecucion TIMESTAMPTZ,
  filas            INTEGER,
  checksum         VARCHAR(40),
  modo             TEXT
);

-- Idempotencia por (run_id, lote): un reintento del agente devuelve la misma
-- respuesta sin volver a aplicar nada. La clave es el PAR, no el run_id solo:
-- una ejecucion tiene varios lotes y hay que poder distinguirlos.
CREATE TABLE IF NOT EXISTS erp.sync_recibidos (
  run_id     UUID        NOT NULL,
  lote       INTEGER     NOT NULL,
  dataset    TEXT        NOT NULL,
  respuesta  JSONB       NOT NULL,
  recibido   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, lote)
);

-- Para la purga de lo que pasa de 7 dias.
CREATE INDEX IF NOT EXISTS ix_erp_recibidos_recibido
  ON erp.sync_recibidos (recibido);
