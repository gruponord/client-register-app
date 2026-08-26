// Registro de datasets que esta app recibe del Sincronizador GNP.
//
// Es LO UNICO especifico de la app en todo el receptor: el resto
// (autenticacion, idempotencia, upsert, bajas, checksum, cierre) es generico y
// vive en sync.service.js. Anadir un dataset es anadir una entrada aqui + su
// tabla en una migracion.
//
// Contrato: "Sincronizador GNP/CONTRATO-SYNC.md".
//
// - `clave`: la clave natural del ERP. Es la PRIMARY KEY de la tabla; nunca hay
//   un id sustituto, y el orden debe coincidir con el del trabajo del agente.
// - `columnas`: columnas de negocio, sin las de control. Solo estas se
//   escriben; cualquier otro campo que llegue en la fila se ignora.
//
// Al declarar un dataset nuevo, mirar el trabajo correspondiente en
// "Sincronizador GNP/trabajos/" y copiar de alli clave y columnas: si no
// cuadran, las filas se rechazan una a una con su motivo.
const DATASETS = {
  'erp.secciones': {
    tabla: 'erp.secciones',
    clave: ['empresa_id', 'seccion_id'],
    columnas: ['empresa_id', 'seccion_id', 'nombre', 'nif', 'domicilio', 'codpostal', 'poblacion'],
    // Horas sin recibir nada a partir de las cuales el dato se considera viejo.
    // El trabajo corre a diario (cron '15 7 * * *'), asi que 26h deja margen
    // para un ciclo fallado sin dar la alarma por un retraso de minutos.
    frescuraHoras: 26,
  },
  'erp.vendedores': {
    tabla: 'erp.vendedores',
    clave: ['empresa_id', 'seccion_id', 'vendedor_id'],
    columnas: [
      'empresa_id', 'seccion_id', 'vendedor_id', 'nombre', 'email', 'zona',
      'vend_resp_id', 'colaborador_id', 'movilidad_prev', 'baja', 'activoreal',
    ],
    frescuraHoras: 26,
  },
  'erp.familias': {
    tabla: 'erp.familias',
    clave: ['empresa_id', 'familia_id'],
    columnas: ['empresa_id', 'familia_id', 'descripcion'],
    frescuraHoras: 26,
  },
  'erp.proveedores': {
    tabla: 'erp.proveedores',
    clave: ['empresa_id', 'proveedor_id'],
    columnas: ['empresa_id', 'proveedor_id', 'xnombre'],
    frescuraHoras: 26,
  },
  // seccion_id esta en la clave porque el mismo ruta_ventas_id se reutiliza
  // entre secciones: 171 valores distintos para 218 filas.
  'erp.rutas_venta': {
    tabla: 'erp.rutas_venta',
    clave: ['empresa_id', 'seccion_id', 'ruta_ventas_id'],
    columnas: ['empresa_id', 'seccion_id', 'ruta_ventas_id', 'descripcion', 'vendedor_id'],
    frescuraHoras: 26,
  },
  'erp.articulos_sec': {
    tabla: 'erp.articulos_sec',
    clave: ['empresa_id', 'articulo_id', 'seccion_id'],
    columnas: [
      'empresa_id', 'articulo_id', 'seccion_id',
      'precio_vta', 'precio_vta_b', 'por_dto', 'por_dto2', 'iva_id', 'ibee_id',
      'cantapromo', 'cantbasepromo', 'stock_semaforo', 'status', 'alta_catalogo',
      'vta_unid', 'vta_tpv', 'aliquidar', 'bajopedido',
    ],
    frescuraHoras: 26,
  },
  'erp.cli_env': {
    tabla: 'erp.cli_env',
    clave: ['empresa_id', 'cliente_id', 'local_id'],
    columnas: [
      'empresa_id', 'cliente_id', 'local_id', 'nombre', 'domicilio', 'cod_postal',
      'poblacion', 'provincia_id', 'pais_id', 'telefono', 'email', 'zona_reparto_id',
      'zona_venta_id', 'diareparto', 'diadescanso', 'reparto_pos',
      'hora_ini1', 'hora_fin1', 'hora_ini2', 'hora_fin2', 'tiempo_servicio', 'req_visita',
    ],
    frescuraHoras: 26,
  },
  // origen_id esta en la clave porque sin el hay 37.337 filas para 36.289 claves.
  'erp.cltes_rutas_vta': {
    tabla: 'erp.cltes_rutas_vta',
    clave: ['empresa_id', 'cliente_id', 'local_id', 'origen_id'],
    columnas: [
      'empresa_id', 'cliente_id', 'local_id', 'origen_id',
      'ruta_venta_id', 'ruta_venta_pos', 'periodicidad', 'period_semana',
    ],
    frescuraHoras: 26,
  },
};

// Columnas que gestiona el receptor y que ninguna definicion debe declarar.
const COLUMNAS_CONTROL = ['activo', 'sync_clave', 'sync_hash', 'sync_run', 'sync_actualizado'];

const obtenerDataset = (nombre) => DATASETS[nombre] || null;

module.exports = { DATASETS, COLUMNAS_CONTROL, obtenerDataset };
