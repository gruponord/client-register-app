// Receptor de datos del ERP (Sincronizador GNP).
//
// Contrato: "Sincronizador GNP/CONTRATO-SYNC.md". El flujo va en una sola
// direccion: el agente empuja, esta app guarda y a partir de ahi consulta en
// local. La app NUNCA pregunta al agente ni al ERP, asi que si se cae la
// oficina la aplicacion sigue funcionando con los datos de la ultima entrega.
const pool = require('../config/dbSync');
const poolApp = require('../config/db');
const { DATASETS } = require('../config/datasets');
const sync = require('../services/sync.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/sync/v1/:dataset — recibe un lote.
 *
 * Devuelve 200 con las filas aplicadas y las rechazadas. Un 200 con
 * `rechazadas` NO es un fallo: el agente confirma solo las aceptadas y las
 * demas vuelven a salir en el diff del ciclo siguiente (§7).
 */
const recibirLote = async (req, res) => {
  const { def, dataset } = req;
  const { runId, modo = 'delta', filas = [], bajas = [] } = req.body || {};
  const lote = Number(req.body?.lote ?? 1);
  const lotes = req.body?.lotes;

  // 400 = peticion malformada. El agente no lo reintenta y alerta, que es lo
  // correcto: reintentar no va a arreglar un cuerpo mal formado.
  if (!runId || !UUID_RE.test(runId)) {
    return res.status(400).json({ error: 'runId ausente o no es un UUID' });
  }
  if (!Number.isInteger(lote) || lote < 1) {
    return res.status(400).json({ error: 'lote debe ser un entero >= 1' });
  }
  if (!Array.isArray(filas) || !Array.isArray(bajas)) {
    return res.status(400).json({ error: 'filas y bajas deben ser arrays' });
  }
  if (modo !== 'delta' && modo !== 'completo') {
    return res.status(400).json({ error: `modo desconocido: ${modo}` });
  }

  const cliente = await pool.connect();
  try {
    // Idempotencia por el PAR (runId, lote), no por el runId solo: una
    // ejecucion tiene varios lotes y hay que poder distinguirlos (§3).
    const previa = await sync.respuestaPrevia(cliente, runId, lote);
    if (previa) {
      return res.json({ repetido: true, ...previa });
    }

    await cliente.query('BEGIN');

    const aplicadas = await sync.aplicarFilas(cliente, def, filas, runId);
    // En modo completo no vienen bajas: se resuelven al cerrar (§5).
    const desactivadas = await sync.aplicarBajas(cliente, def, bajas, runId);

    // El checksum es caro en un envio grande y no aporta en los lotes
    // intermedios, asi que solo en el ultimo. Y en modo completo no tiene
    // sentido hasta el cierre, porque hasta entonces el universo esta a medias.
    const esUltimo = !lotes || lote >= Number(lotes);
    let checksum = null;
    if (esUltimo && modo !== 'completo') {
      checksum = await sync.calcularChecksum(cliente, def.tabla);
      const activas = await sync.contarActivas(cliente, def.tabla);
      await sync.registrarFrescura(cliente, dataset, activas, checksum, modo);
      await sync.purgarRecibidos(cliente);
    }

    const respuesta = {
      aplicadas: aplicadas.aplicadas,
      bajas: desactivadas.aplicadas,
      rechazadas: aplicadas.rechazadas.concat(desactivadas.rechazadas),
    };
    if (checksum) respuesta.checksum = checksum;

    // El registro de idempotencia entra en la MISMA transaccion que los datos:
    // si se guardara aparte, un fallo entre las dos escrituras dejaria un lote
    // aplicado que el reintento volveria a aplicar.
    //
    // Aqui es donde se resuelve la carrera del cluster: PM2 arranca 2
    // instancias, asi que un reintento del agente puede entrar por la segunda
    // mientras la primera aun no ha hecho COMMIT. La comprobacion de
    // respuestaPrevia no la ve (no esta commiteada), pero esta INSERT choca
    // contra la clave primaria (run_id, lote) y el lote duplicado se deshace
    // entero. 409 y no 500: el contrato lo define como "(runId, lote) en curso"
    // y el agente reintenta con espera, que es exactamente lo que hay que hacer.
    try {
      await sync.registrarRecibido(cliente, runId, lote, dataset, respuesta);
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      if (err.code === '23505') {
        console.warn(`[sync] ${dataset} lote ${lote}: ya en curso en otra instancia`);
        return res.status(409).json({ error: 'Ese (runId, lote) ya se esta procesando' });
      }
      throw err;
    }

    await cliente.query('COMMIT');

    if (respuesta.rechazadas.length) {
      console.warn(
        `[sync] ${dataset} lote ${lote}: ${respuesta.rechazadas.length} filas rechazadas`,
        respuesta.rechazadas.slice(0, 5)
      );
    }
    res.json(respuesta);
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    // 5xx: el agente reintenta con espera creciente.
    console.error(`[sync] error recibiendo ${dataset} lote ${lote}:`, err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    cliente.release();
  }
};

/**
 * POST /api/sync/v1/:dataset/cerrar — cierre de un envio en modo completo (§5).
 *
 * Sin esta llamada NO se desactiva nada: es preferible quedarse con filas de
 * mas que dar de baja media tabla por un envio que se corto a medias.
 */
const cerrar = async (req, res) => {
  const { def, dataset } = req;
  const { runId } = req.body || {};

  if (!runId || !UUID_RE.test(runId)) {
    return res.status(400).json({ error: 'runId ausente o no es un UUID' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const desactivadas = await sync.cerrarCompleto(cliente, def, runId);
    const checksum = await sync.calcularChecksum(cliente, def.tabla);
    const filas = await sync.contarActivas(cliente, def.tabla);
    await sync.registrarFrescura(cliente, dataset, filas, checksum, 'completo');
    await sync.purgarRecibidos(cliente);

    await cliente.query('COMMIT');
    console.log(`[sync] ${dataset} cerrado: ${filas} activas, ${desactivadas} desactivadas`);
    res.json({ desactivadas, filas, checksum });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(`[sync] error cerrando ${dataset}:`, err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    cliente.release();
  }
};

/**
 * GET /api/sync/v1/:dataset/checksum — para que el agente se verifique.
 *
 * Lo llama el agente al terminar un ciclo: si su checksum y este no cuadran,
 * el ciclo siguiente va en modo completo y la divergencia se arregla sola.
 */
const checksum = async (req, res) => {
  const cliente = await pool.connect();
  try {
    res.json({
      dataset: req.dataset,
      filas: await sync.contarActivas(cliente, req.def.tabla),
      checksum: await sync.calcularChecksum(cliente, req.def.tabla),
    });
  } catch (err) {
    console.error(`[sync] error calculando checksum de ${req.dataset}:`, err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    cliente.release();
  }
};

/**
 * GET /api/sync/v1/estado — frescura de cada dataset, para la pantalla de
 * administracion. Esta la consulta la app, asi que va con el pool de la app y
 * protegida con JWT, no con la clave del agente.
 *
 * Se recorre el registro de codigo y no la tabla: asi un dataset declarado del
 * que nunca ha llegado nada sale igual, marcado como no recibido, en vez de
 * desaparecer del listado.
 */
const estado = async (req, res) => {
  try {
    const result = await poolApp.query(
      'SELECT dataset, ultima_ejecucion, filas, checksum, modo FROM erp.datasets'
    );
    const porDataset = new Map(result.rows.map((f) => [f.dataset, f]));
    const ahora = Date.now();

    const datasets = Object.entries(DATASETS).map(([nombre, def]) => {
      const fila = porDataset.get(nombre) || null;
      const horas = fila?.ultima_ejecucion
        ? (ahora - new Date(fila.ultima_ejecucion).getTime()) / 3600000
        : null;
      return {
        dataset: nombre,
        ultima_ejecucion: fila?.ultima_ejecucion ?? null,
        filas: fila?.filas ?? null,
        checksum: fila?.checksum ?? null,
        modo: fila?.modo ?? null,
        horas_desde: horas === null ? null : Math.round(horas * 10) / 10,
        // Aviso si un dataset lleva mas de lo suyo sin recibir nada (§9).
        // Nunca recibido tambien cuenta como viejo: es la senal de que el
        // trabajo del agente no esta llegando.
        viejo: horas === null || horas > def.frescuraHoras,
        frescura_horas: def.frescuraHoras,
      };
    });

    res.json({ datasets, alertas: datasets.filter((d) => d.viejo).map((d) => d.dataset) });
  } catch (err) {
    console.error('Error al consultar estado de sincronizacion:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { recibirLote, cerrar, checksum, estado };
