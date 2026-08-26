-- Seis datasets nuevos de la replica del ERP.
--
-- Adaptado de "Sincronizador GNP/receptor-referencia/esquema.sql", que el
-- agente GENERA a partir de sus propios trabajos. Por eso los tipos no se
-- discuten aqui: si el trabajo declara `decimal/escala 4`, la columna es
-- NUMERIC, y si declara `entero`, es BIGINT. Copiarlos a mano fue lo que
-- provoco el incidente de movilidad_prev (ver migracion 010).
--
-- Cambios respecto al fichero generado, solo de forma:
--   - NOT NULL explicito en las columnas de clave (la PRIMARY KEY ya lo impone,
--     pero el resto de este esquema lo declara)
--   - indices con el prefijo ix_erp_*, como en la 009
--
-- Tres tipos que parecian booleanos y NO lo son, comprobados con SELECT
-- DISTINCT sobre el ERP antes de crear estas tablas: `status` de articulos_sec
-- (tiene -1, 0 y 3, y la unica fila con el 3 seria indistinguible de las
-- 24.651 con -1 si fuese BOOLEAN), y las cantidades cantapromo,
-- cantbasepromo, stock_semaforo y tiempo_servicio.
--
-- OJO CON LOS TIMESTAMP: las fechas del ERP no llevan zona y se guardan tal
-- cual. node-postgres, al leerlas, construye un Date interpretandolas como hora
-- local y las imprime desplazadas. Por eso config/pgTypes.js registra el OID
-- 1114 como paso directo: la app recibe la cadena que hay en la columna. Las
-- horas de cli_env (hora_ini1, hora_fin1...) son donde el desplazamiento pasaria
-- mas desapercibido.

-- ---------------------------------------------------------------------------
-- erp.familias — 74 filas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.familias (
  empresa_id       TEXT         NOT NULL,
  familia_id       TEXT         NOT NULL,

  descripcion      TEXT,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, familia_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_familias_clave
  ON erp.familias (sync_clave COLLATE "C");

-- ---------------------------------------------------------------------------
-- erp.proveedores — 1.396 filas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.proveedores (
  empresa_id       TEXT         NOT NULL,
  proveedor_id     TEXT         NOT NULL,

  xnombre          TEXT,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, proveedor_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_proveedores_clave
  ON erp.proveedores (sync_clave COLLATE "C");

-- ---------------------------------------------------------------------------
-- erp.rutas_venta — 218 filas
--
-- seccion_id entra en la clave y no es decorativo: el mismo ruta_ventas_id se
-- reutiliza entre secciones (171 valores distintos para 218 filas).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.rutas_venta (
  empresa_id       TEXT         NOT NULL,
  seccion_id       TEXT         NOT NULL,
  ruta_ventas_id   TEXT         NOT NULL,

  descripcion      TEXT,
  vendedor_id      TEXT,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, seccion_id, ruta_ventas_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_rutas_venta_clave
  ON erp.rutas_venta (sync_clave COLLATE "C");

-- ---------------------------------------------------------------------------
-- erp.articulos_sec — 29.696 filas. Precios y condiciones por seccion.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.articulos_sec (
  empresa_id       TEXT         NOT NULL,
  articulo_id      TEXT         NOT NULL,
  seccion_id       TEXT         NOT NULL,

  -- NUMERIC sin precision declarada: el agente los envia como cadena con
  -- escala fija 4, y una precision de menos rechazaria la fila.
  precio_vta       NUMERIC,
  precio_vta_b     NUMERIC,
  por_dto          NUMERIC,
  por_dto2         NUMERIC,
  iva_id           TEXT,
  ibee_id          TEXT,
  -- Cantidades, no flags.
  cantapromo       BIGINT,
  cantbasepromo    BIGINT,
  stock_semaforo   BIGINT,
  -- status tiene -1, 0 y 3: enumeracion, no booleano.
  status           BIGINT,
  alta_catalogo    TIMESTAMP,
  vta_unid         BOOLEAN,
  vta_tpv          BOOLEAN,
  aliquidar        BOOLEAN,
  bajopedido       BOOLEAN,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, articulo_id, seccion_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_articulos_sec_clave
  ON erp.articulos_sec (sync_clave COLLATE "C");

-- ---------------------------------------------------------------------------
-- erp.cli_env — 36.327 filas. Locales de entrega de cada cliente.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.cli_env (
  empresa_id       TEXT         NOT NULL,
  cliente_id       TEXT         NOT NULL,
  local_id         TEXT         NOT NULL,

  nombre           TEXT,
  domicilio        TEXT,
  cod_postal       TEXT,
  poblacion        TEXT,
  provincia_id     TEXT,
  pais_id          TEXT,
  telefono         TEXT,
  email            TEXT,
  zona_reparto_id  TEXT,
  zona_venta_id    TEXT,
  diareparto       TEXT,
  diadescanso      TEXT,
  reparto_pos      BIGINT,
  -- Franjas horarias de entrega. Son TIMESTAMP en el ERP aunque solo importe la
  -- hora; leerlas con el parser por defecto de node-postgres las desplaza una
  -- hora y aqui no se notaria. Ver config/pgTypes.js.
  hora_ini1        TIMESTAMP,
  hora_fin1        TIMESTAMP,
  hora_ini2        TIMESTAMP,
  hora_fin2        TIMESTAMP,
  tiempo_servicio  BIGINT,
  req_visita       BOOLEAN,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, cliente_id, local_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_cli_env_clave
  ON erp.cli_env (sync_clave COLLATE "C");

-- ---------------------------------------------------------------------------
-- erp.cltes_rutas_vta — 37.337 filas. Asignacion de locales a rutas de venta.
--
-- origen_id entra en la clave porque sin el hay 37.337 filas para 36.289
-- claves. Ojo al cruzar con erp.rutas_venta: aqui la columna se llama
-- ruta_venta_id y alli ruta_ventas_id (plural), y esta tabla no trae
-- seccion_id, que alli forma parte de la clave.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp.cltes_rutas_vta (
  empresa_id       TEXT         NOT NULL,
  cliente_id       TEXT         NOT NULL,
  local_id         TEXT         NOT NULL,
  origen_id        TEXT         NOT NULL,

  ruta_venta_id    TEXT,
  ruta_venta_pos   BIGINT,
  periodicidad     TEXT,
  period_semana    TEXT,

  activo           BOOLEAN      NOT NULL DEFAULT true,
  sync_clave       TEXT         NOT NULL,
  sync_hash        VARCHAR(40)  NOT NULL,
  sync_run         UUID,
  sync_actualizado TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (empresa_id, cliente_id, local_id, origen_id)
);

CREATE INDEX IF NOT EXISTS ix_erp_cltes_rutas_vta_clave
  ON erp.cltes_rutas_vta (sync_clave COLLATE "C");
