// Carrera del cluster: dos instancias, el mismo (runId, lote) simultaneo.
// Es lo que pasa en produccion, donde PM2 arranca 2 instancias, y no se puede
// reproducir con el servidor de una sola que use el banco de pruebas normal.
'use strict';

const path = require('path');
const crypto = require('crypto');
const cluster = require('cluster');

const APP = path.join(__dirname, '..');
// Esta suite usa el hash.js y los trabajos DEL AGENTE para comprobar que el
// checksum de las dos puntas coincide con su codigo real. Si el otro
// repositorio no esta al lado, indica donde con SINCRONIZADOR_DIR.
const AGENTE = process.env.SINCRONIZADOR_DIR
  || path.resolve(__dirname, '../../../../Sincronizador GNP');
if (!require('fs').existsSync(path.join(AGENTE, 'src/hash.js'))) {
  console.log('OMITIDA: no encuentro el Sincronizador GNP en ' + AGENTE);
  console.log('         indicalo con SINCRONIZADOR_DIR=<ruta>');
  process.exit(0);
}

process.env.PORT = '3998';
process.env.SYNC_API_KEY = 'clave-de-prueba-cluster';
require('dotenv').config({ path: path.join(APP, '.env') });
process.env.PORT = '3998';

if (cluster.isPrimary) {
  const { hashFila, serializarClave, normalizarFila } = require(path.join(AGENTE, 'src/hash.js'));
  const trabajo = require(path.join(AGENTE, 'trabajos/erp-vendedores.js'));
  const { columnas, clave, tipos } = trabajo.origen;

  let listas = 0;
  for (let i = 0; i < 2; i++) cluster.fork();
  cluster.on('message', async (_w, msg) => {
    if (msg !== 'lista' || ++listas < 2) return;
    await correr();
  });

  const correr = async () => {
    const pool = require(path.join(APP, 'src/config/db.js'));
    await pool.query('TRUNCATE erp.vendedores, erp.datasets, erp.sync_recibidos');

    const crudas = [];
    for (let i = 0; i < 120; i++) {
      crudas.push({
        empresa_id: 'GN', seccion_id: 'C', vendedor_id: String(i).padStart(4, '0'),
        nombre: 'Vendedor ' + i, email: 'v' + i + '@x.com', zona: 'ZONA ' + i,
        vend_resp_id: null, colaborador_id: i, movilidad_prev: null, baja: 0, activoreal: -1,
      });
    }
    const entradas = crudas.map((c) => ({
      clave: serializarClave(c, clave, tipos), hash: hashFila(c, columnas, tipos), fila: c,
    }));

    const runId = crypto.randomUUID();
    const cuerpo = {
      runId, dataset: 'erp.vendedores', modo: 'delta', lote: 1, lotes: 1,
      filas: entradas.map((e) => {
        const n = normalizarFila(e.fila, columnas, tipos);
        const _clave = {};
        for (const c of clave) _clave[c] = n[c];
        return Object.assign({ _clave, _claveId: e.clave, _hash: e.hash }, n);
      }),
      bajas: [],
    };

    const enviar = () => fetch('http://127.0.0.1:3998/api/sync/v1/erp.vendedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.SYNC_API_KEY },
      body: JSON.stringify(cuerpo),
    }).then(async (r) => ({ estado: r.status, cuerpo: await r.json().catch(() => null) }));

    // Seis peticiones identicas a la vez: reparto entre las dos instancias.
    const rs = await Promise.all(Array.from({ length: 6 }, enviar));
    const codigos = rs.map((r) => r.estado).sort();
    const ok = rs.filter((r) => r.estado === 200);
    const conflicto = rs.filter((r) => r.estado === 409);
    const filas = (await pool.query('SELECT COUNT(*)::int c FROM erp.vendedores')).rows[0].c;
    const recibidos = (await pool.query('SELECT COUNT(*)::int c FROM erp.sync_recibidos')).rows[0].c;

    let fallos = 0;
    const comprobar = (t, cond, d) => {
      console.log((cond ? '  OK   ' : '  FALLO') + '  ' + t + (d ? '  -> ' + d : ''));
      if (!cond) fallos++;
    };

    console.log('\nCarrera del cluster: 6 peticiones identicas, 2 instancias');
    console.log('  codigos: ' + codigos.join(', '));
    comprobar('ningun 500', !codigos.includes(500), codigos.join(','));
    comprobar('al menos un 200', ok.length >= 1, ok.length + ' respuestas 200');
    comprobar('el resto son 409 o repetido',
      rs.every((r) => r.estado === 200 || r.estado === 409));
    comprobar('las 120 filas aplicadas UNA vez', filas === 120, 'hay ' + filas);
    comprobar('un solo registro de idempotencia', recibidos === 1, 'hay ' + recibidos);
    if (conflicto.length) console.log('  (' + conflicto.length + ' devolvieron 409, reintentables)');

    // El reintento posterior tiene que dar la respuesta guardada, no reaplicar.
    const despues = await enviar();
    comprobar('reintento posterior -> repetido',
      despues.estado === 200 && despues.cuerpo.repetido === true,
      'HTTP ' + despues.estado);
    const filas2 = (await pool.query('SELECT COUNT(*)::int c FROM erp.vendedores')).rows[0].c;
    comprobar('sigue habiendo 120 filas', filas2 === 120, 'hay ' + filas2);

    await pool.query('TRUNCATE erp.vendedores, erp.datasets, erp.sync_recibidos');
    await pool.end();
    console.log(fallos === 0 ? '\nTODO OK' : '\n' + fallos + ' FALLOS');
    for (const id in cluster.workers) cluster.workers[id].kill();
    process.exit(fallos === 0 ? 0 : 1);
  };
} else {
  require(path.join(APP, 'src/index.js'));
  setTimeout(() => process.send('lista'), 800);
}
