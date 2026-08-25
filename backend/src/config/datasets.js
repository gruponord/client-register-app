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
};

// Columnas que gestiona el receptor y que ninguna definicion debe declarar.
const COLUMNAS_CONTROL = ['activo', 'sync_clave', 'sync_hash', 'sync_run', 'sync_actualizado'];

const obtenerDataset = (nombre) => DATASETS[nombre] || null;

module.exports = { DATASETS, COLUMNAS_CONTROL, obtenerDataset };
