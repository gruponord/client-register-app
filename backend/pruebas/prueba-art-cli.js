// erp.articulos y erp.clientes, con el hash.js y los trabajos reales.
// Incluye la comprobacion de que un rechazo de erp.clientes NO filtra datos
// personales ni en la respuesta ni en el registro de idempotencia.
'use strict';

const path = require('path');
const crypto = require('crypto');

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
const APP = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(APP, '.env') });
require('./guarda');   // aborta si la base no es de desarrollo

const { hashFila, serializarClave, normalizarFila } = require(path.join(AGENTE, 'src/hash.js'));
const BASE = 'http://127.0.0.1:3999';
const API_KEY = 'clave-de-prueba-e2e';

let fallos = 0;
const comprobar = (t, cond, d) => {
  console.log((cond ? '  OK   ' : '  FALLO') + '  ' + t + (d ? '  -> ' + d : ''));
  if (!cond) fallos++;
};

const crudo = (col, spec, i) => {
  const tipo = (spec && spec.tipo) || 'texto';
  if (tipo === 'decimal') return 3.25 + i;
  if (tipo === 'entero') return i;
  if (tipo === 'booleano') return i % 2 === 0 ? -1 : 0;
  if (tipo === 'fecha') return new Date(2025, 9, 28, 0, 0, 0);
  return col.endsWith('_id') ? String(i).padStart(3, '0') : col.toUpperCase() + '-' + i;
};

const construir = (trabajo, n, retoque) => {
  const { columnas, clave, tipos = {} } = trabajo.origen;
  const out = [];
  for (let i = 0; i < n; i++) {
    const fila = {};
    for (const c of columnas) fila[c] = crudo(c, tipos[c], i);
    for (const c of clave) fila[c] = (c === 'empresa_id') ? 'GN' : 'K' + i;
    if (retoque) retoque(fila, i);
    out.push({ clave: serializarClave(fila, clave, tipos), hash: hashFila(fila, columnas, tipos), fila });
  }
  return out;
};

const lote = (trabajo, entradas, runId) => {
  const { columnas, clave, tipos = {} } = trabajo.origen;
  return {
    runId, dataset: trabajo.dataset, modo: 'delta', lote: 1, lotes: 1,
    filas: entradas.map((e) => {
      const n = normalizarFila(e.fila, columnas, tipos);
      const _clave = {};
      for (const c of clave) _clave[c] = n[c];
      return Object.assign({ _clave, _claveId: e.clave, _hash: e.hash }, n);
    }),
    bajas: [],
  };
};

const checksumAgente = (es) => crypto.createHash('sha1')
  .update(es.map((e) => e.clave + '=' + e.hash).sort().join('\n'), 'utf8').digest('hex');

const enviar = (ds, cuerpo) => fetch(BASE + '/api/sync/v1/' + ds, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
  body: JSON.stringify(cuerpo),
}).then(async (r) => ({ estado: r.status, cuerpo: await r.json().catch(() => null) }));

(async () => {
  const pool = require(path.join(APP, 'src/config/db.js'));
  await pool.query('TRUNCATE erp.articulos, erp.clientes, erp.sync_recibidos, erp.datasets');

  const tArt = require(path.join(AGENTE, 'trabajos/erp-articulos.js'));
  const tCli = require(path.join(AGENTE, 'trabajos/erp-clientes.js'));

  console.log('\n=== Los dos datasets ===');
  for (const [t, n] of [[tArt, 40], [tCli, 40]]) {
    const es = construir(t, n);
    const r = await enviar(t.dataset, lote(t, es, crypto.randomUUID()));
    comprobar(t.dataset.padEnd(16) + n + ' filas aplicadas',
      r.estado === 200 && r.cuerpo.aplicadas === n && !r.cuerpo.rechazadas.length,
      JSON.stringify(r.cuerpo && (r.cuerpo.rechazadas.length ? r.cuerpo.rechazadas : r.cuerpo.aplicadas)));
    comprobar(t.dataset.padEnd(16) + 'checksum coincide con el agente',
      r.cuerpo && r.cuerpo.checksum === checksumAgente(es), r.cuerpo && r.cuerpo.checksum);
  }

  console.log('\n=== tipo_fact: codigo 1-4, no si/no ===');
  await pool.query("UPDATE erp.clientes SET tipo_fact = 4 WHERE cliente_id = 'K1'");
  const tf = await pool.query("SELECT cliente_id, tipo_fact FROM erp.clientes WHERE cliente_id IN ('K1','K3') ORDER BY 1");
  comprobar('el 4 y el 3 se distinguen',
    String(tf.rows[0].tipo_fact) === '4' && String(tf.rows[1].tipo_fact) === '3',
    JSON.stringify(tf.rows.map((x) => x.cliente_id + '=' + x.tipo_fact)));

  console.log('\n=== estado = false NO se filtra en el receptor ===');
  const bajas = construir(tCli, 4, (f, i) => { f.cliente_id = 'B' + i; f.estado = 0; });
  const rb = await enviar('erp.clientes', lote(tCli, bajas, crypto.randomUUID()));
  comprobar('las 4 con estado=false entran', rb.cuerpo.aplicadas === 4, JSON.stringify(rb.cuerpo.rechazadas));
  const e0 = await pool.query("SELECT count(*)::int n FROM erp.clientes WHERE cliente_id LIKE 'B%' AND estado = false AND activo");
  comprobar('las 4 de baja siguen activas en la replica (se filtra al consultar)',
    e0.rows[0].n === 4, 'hay ' + e0.rows[0].n);

  console.log('\n=== Datos personales: un rechazo NO los filtra ===');
  const PII = { nombre: 'MARIA LOPEZ GARCIA', nif: '12345678Z', email: 'maria.lopez@ejemplo.com',
    domicilio: 'CALLE FALSA 123', email_factura: 'facturas.lopez@ejemplo.com' };
  const runId = crypto.randomUUID();
  const cuerpo = lote(tCli, construir(tCli, 1, (f) => { f.cliente_id = 'PII1'; Object.assign(f, PII); }), runId);
  cuerpo.filas[0].tipo_fact = 'no-es-un-numero';   // fuerza el error de PostgreSQL
  const rp = await enviar('erp.clientes', cuerpo);

  comprobar('la fila se rechaza', rp.cuerpo.rechazadas.length === 1, JSON.stringify(rp.cuerpo.aplicadas));
  const texto = JSON.stringify(rp.cuerpo);
  const filtrados = Object.entries(PII).filter(([, v]) => texto.includes(v)).map(([k]) => k);
  comprobar('la RESPUESTA no contiene ningun dato personal',
    filtrados.length === 0, filtrados.length ? 'filtrados: ' + filtrados.join(', ') : 'limpia');
  comprobar('la respuesta si trae la clave y el motivo',
    rp.cuerpo.rechazadas[0].clave.cliente_id === 'PII1' && /bigint/i.test(rp.cuerpo.rechazadas[0].motivo),
    JSON.stringify(rp.cuerpo.rechazadas[0]));

  const guardado = await pool.query('SELECT respuesta FROM erp.sync_recibidos WHERE run_id = $1', [runId]);
  const textoBd = JSON.stringify(guardado.rows[0].respuesta);
  const enBd = Object.entries(PII).filter(([, v]) => textoBd.includes(v)).map(([k]) => k);
  comprobar('el registro de idempotencia tampoco los guarda',
    enBd.length === 0, enBd.length ? 'filtrados: ' + enBd.join(', ') : 'limpio');

  console.log('\n=== Volumen: lote de 500 de erp.clientes (25 columnas) ===');
  const muchos = construir(tCli, 500, (f, i) => { f.cliente_id = 'V' + i; });
  const cg = lote(tCli, muchos, crypto.randomUUID());
  console.log('    cuerpo: ' + Math.round(JSON.stringify(cg).length / 1024) + ' KB');
  const g = await enviar('erp.clientes', cg);
  comprobar('500 filas aplicadas', g.estado === 200 && g.cuerpo.aplicadas === 500,
    JSON.stringify(g.cuerpo && g.cuerpo.aplicadas));

  await pool.query('TRUNCATE erp.articulos, erp.clientes, erp.sync_recibidos, erp.datasets');
  await pool.end();
  console.log(fallos === 0 ? '\nTODO OK' : '\n' + fallos + ' FALLOS');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION: ' + e.stack); process.exit(1); });
