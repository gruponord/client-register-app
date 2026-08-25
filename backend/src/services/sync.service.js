// Mecanica generica del receptor de sincronizacion.
//
// Contrato: "Sincronizador GNP/CONTRATO-SYNC.md". Aqui no hay nada especifico
// de un dataset concreto: lo especifico esta en config/datasets.js.
const crypto = require('crypto');
const { COLUMNAS_CONTROL } = require('../config/datasets');

// ---------------------------------------------------------------------------
// Checksum (contrato §4)
// ---------------------------------------------------------------------------

/**
 * Checksum del dataset: es el mecanismo de auto-reparacion. El agente compara
 * este valor con el suyo y, si no cuadran, el ciclo siguiente va en modo
 * `completo` y se arregla solo sin que nadie intervenga.
 *
 * Las dos puntas tienen que calcularlo EXACTAMENTE igual:
 *   1. solo filas activas (las de baja quedan fuera: el agente borra esas
 *      claves de su estado al confirmarlas, y si aqui se contaran, los dos
 *      lados divergirian para siempre),
 *   2. ordenadas por sync_clave en orden de BYTES,
 *   3. una linea "clave=hash" por fila, unidas con \n sin salto final,
 *   4. SHA-1 en hexadecimal minuscula.
 *
 * El COLLATE "C" del punto 2 no es decorativo y es el que se olvida: sin el, el
 * orden depende de la localizacion del servidor y el checksum no coincide con
 * el del agente aunque los datos sean identicos.
 *
 * Un dataset vacio da el SHA-1 de la cadena vacia, que es lo que sale solo.
 */
const calcularChecksum = async (cliente, tabla) => {
  const result = await cliente.query(
    `SELECT sync_clave, sync_hash FROM ${tabla}
      WHERE activo ORDER BY sync_clave COLLATE "C"`
  );
  const cadena = result.rows.map((f) => `${f.sync_clave}=${f.sync_hash}`).join('\n');
  return crypto.createHash('sha1').update(cadena, 'utf8').digest('hex');
};

const contarActivas = async (cliente, tabla) => {
  const result = await cliente.query(`SELECT COUNT(*)::int AS n FROM ${tabla} WHERE activo`);
  return result.rows[0].n;
};

// ---------------------------------------------------------------------------
// Aplicacion de filas
// ---------------------------------------------------------------------------

// Las sentencias no dependen de los datos, solo de la definicion: se construyen
// una vez y se reutilizan en cada lote.
const cacheUpsert = new Map();

/**
 * UPSERT por clave natural. Cada fila que entra o se actualiza queda sellada
 * con el runId en `sync_run`: es lo que permite cerrar un envio completo (§5).
 * Y `activo` vuelve a true, para que una fila que reaparece se reactive.
 */
const sentenciaUpsert = (def) => {
  if (cacheUpsert.has(def.tabla)) return cacheUpsert.get(def.tabla);

  const n = def.columnas.length;
  const columnas = def.columnas.concat(COLUMNAS_CONTROL);
  const valores = def.columnas
    .map((_, i) => `$${i + 1}`)
    .concat(['true', `$${n + 1}`, `$${n + 2}`, `$${n + 3}`, 'NOW()']);
  // Las columnas de la clave no se actualizan: son el ON CONFLICT.
  const actualizables = def.columnas
    .filter((c) => !def.clave.includes(c))
    .concat(COLUMNAS_CONTROL);

  const sql = `
    INSERT INTO ${def.tabla} (${columnas.join(', ')})
    VALUES (${valores.join(', ')})
    ON CONFLICT (${def.clave.join(', ')}) DO UPDATE SET
      ${actualizables.map((c) => `${c} = EXCLUDED.${c}`).join(',\n      ')}
  `;
  cacheUpsert.set(def.tabla, sql);
  return sql;
};

/**
 * Valida una fila antes de aplicarla. Lo que no pasa por aqui se devuelve en
 * `rechazadas` con su motivo y el agente no lo da por enviado: volvera a salir
 * en el diff del ciclo siguiente, asi que el propio diff es la cola de
 * reintentos y no hay que escribir ninguna (§7).
 *
 * Aqui NO se filtra por reglas de negocio: si llegan 138 vendedores se guardan
 * los 138, aunque la pantalla solo ensene los activos (§8).
 */
const validarFila = (fila, def) => {
  if (!fila || typeof fila !== 'object') return 'la fila no es un objeto';
  if (!fila._clave) return 'falta _clave';
  if (!fila._claveId) return 'falta _claveId';
  if (!fila._hash) return 'falta _hash';
  for (const columna of def.clave) {
    const valor = fila[columna];
    if (valor === null || valor === undefined || valor === '') {
      return `la columna de clave "${columna}" viene vacia`;
    }
  }
  return null;
};

/**
 * Construye una entrada de `rechazadas`.
 *
 * Devuelve SIEMPRE el `claveId` que vino en la fila, ademas de la clave
 * desglosada. El agente empareja el rechazo por ahi para no confirmar esa fila;
 * si solo le devolviesemos `clave`, tendria que comparar contra la clave cruda
 * del ERP y con un CHAR con relleno de espacios no coincide, con lo que daria la
 * fila por aceptada y el dato no llegaria nunca (el diff ya no la vuelve a
 * sacar). Es el punto ciego del checksum entrando por otra puerta.
 *
 * Va a null solo cuando la fila llego sin `_claveId`, que es justamente uno de
 * los motivos de rechazo: ahi no hay nada que devolver.
 */
const rechazo = (fila, motivo) => ({
  clave: (fila && fila._clave) || null,
  claveId: (fila && fila._claveId) || null,
  motivo,
});

/**
 * Aplica las filas de un lote una a una. Una fila que revienta no tumba el
 * lote: se rechaza con su motivo y las demas siguen. Un 200 con `rechazadas`
 * es el caso normal, no un fallo.
 */
const aplicarFilas = async (cliente, def, filas, runId) => {
  const upsert = sentenciaUpsert(def);
  const rechazadas = [];
  let aplicadas = 0;

  for (const fila of filas) {
    const motivo = validarFila(fila, def);
    if (motivo) {
      rechazadas.push(rechazo(fila, motivo));
      continue;
    }
    // Los valores llegan ya normalizados por el agente segun el tipo declarado
    // en el trabajo (booleanos como true/false, decimales como cadena con
    // escala fija, fechas ISO sin zona). Se guardan tal cual, sin convertir.
    const params = def.columnas.map((c) => (fila[c] === undefined ? null : fila[c]));
    params.push(fila._claveId, fila._hash, runId);

    // Savepoint por fila: sin el, un error de PostgreSQL aborta la transaccion
    // entera y se perderian tambien las filas buenas que vinieran detras.
    await cliente.query('SAVEPOINT fila');
    try {
      await cliente.query(upsert, params);
      await cliente.query('RELEASE SAVEPOINT fila');
      aplicadas++;
    } catch (err) {
      await cliente.query('ROLLBACK TO SAVEPOINT fila');
      rechazadas.push(rechazo(fila, String(err.message).slice(0, 200)));
    }
  }

  return { aplicadas, rechazadas };
};

/**
 * Bajas explicitas, que solo llegan en modo delta. Siempre logicas, nunca
 * DELETE: un DELETE destruye la fila y, si fue un error, no hay de donde
 * recuperarla hasta el siguiente envio completo.
 *
 * Viajan solo con `_claveId` porque es lo unico que guarda el estado del
 * agente, y aqui basta porque esa columna esta indexada.
 */
const aplicarBajas = async (cliente, def, bajas, runId) => {
  const rechazadas = [];
  let aplicadas = 0;

  for (const baja of bajas) {
    if (!baja || !baja._claveId) {
      rechazadas.push(rechazo(baja, 'baja sin _claveId'));
      continue;
    }
    const result = await cliente.query(
      `UPDATE ${def.tabla}
          SET activo = false, sync_run = $2, sync_actualizado = NOW()
        WHERE sync_clave = $1 AND activo`,
      [baja._claveId, runId]
    );
    aplicadas += result.rowCount;
  }

  return { aplicadas, rechazadas };
};

/**
 * Cierre de un envio completo (§5). Todo lo que conserve un runId distinto es
 * lo que no ha venido en esta pasada, luego ya no existe en el ERP.
 *
 * IS DISTINCT FROM y no <>: una fila con sync_run NULL tambien tiene que caer.
 */
const cerrarCompleto = async (cliente, def, runId) => {
  const result = await cliente.query(
    `UPDATE ${def.tabla}
        SET activo = false, sync_actualizado = NOW()
      WHERE sync_run IS DISTINCT FROM $1 AND activo`,
    [runId]
  );
  return result.rowCount;
};

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

/** Deja constancia de la frescura del dataset, para poder pintarla en pantalla. */
const registrarFrescura = async (cliente, dataset, filas, checksum, modo) => {
  await cliente.query(
    `INSERT INTO erp.datasets (dataset, ultima_ejecucion, filas, checksum, modo)
     VALUES ($1, NOW(), $2, $3, $4)
     ON CONFLICT (dataset) DO UPDATE SET
       ultima_ejecucion = EXCLUDED.ultima_ejecucion,
       filas            = EXCLUDED.filas,
       checksum         = EXCLUDED.checksum,
       modo             = EXCLUDED.modo`,
    [dataset, filas, checksum, modo]
  );
};

/**
 * Respuesta ya dada para un (runId, lote). El contrato pide devolverla tal cual
 * sin volver a aplicar nada: un fallo de red puede hacer que el agente
 * reintente un lote que en realidad si llego (§3).
 */
const respuestaPrevia = async (cliente, runId, lote) => {
  const result = await cliente.query(
    'SELECT respuesta FROM erp.sync_recibidos WHERE run_id = $1 AND lote = $2',
    [runId, lote]
  );
  return result.rowCount ? result.rows[0].respuesta : null;
};

const registrarRecibido = async (cliente, runId, lote, dataset, respuesta) => {
  await cliente.query(
    `INSERT INTO erp.sync_recibidos (run_id, lote, dataset, respuesta)
     VALUES ($1, $2, $3, $4)`,
    [runId, lote, dataset, JSON.stringify(respuesta)]
  );
};

// 7 dias de historico bastan para cubrir cualquier reintento del agente.
const purgarRecibidos = async (cliente) => {
  await cliente.query(
    "DELETE FROM erp.sync_recibidos WHERE recibido < NOW() - INTERVAL '7 days'"
  );
};

module.exports = {
  calcularChecksum,
  contarActivas,
  aplicarFilas,
  aplicarBajas,
  cerrarCompleto,
  registrarFrescura,
  respuestaPrevia,
  registrarRecibido,
  purgarRecibidos,
  validarFila,
  sentenciaUpsert,
};
