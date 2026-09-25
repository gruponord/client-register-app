// Prueba de los seis datasets nuevos, con el hash.js y los trabajos REALES del
// agente. Las filas se construyen como las devuelve el driver del ERP (objetos
// Date, booleanos -1/0) y se dejan pasar por normalizarFila, que es el camino
// exacto del agente: asi se prueban los tipos nuevos (NUMERIC con escala,
// TIMESTAMP sin zona, BIGINT que parece flag) y no una imitacion.
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

const { hashFila, serializarClave, normalizarFila } = require(path.join(AGENTE, 'src/hash.js'));
const BASE = 'http://127.0.0.1:3999';
const API_KEY = 'clave-de-prueba-e2e';

const DATASETS = ['erp.familias', 'erp.proveedores', 'erp.rutas_venta',
  'erp.articulos_sec', 'erp.cli_env', 'erp.cltes_rutas_vta'];

const FICHERO = {
  'erp.familias': 'erp-familias', 'erp.proveedores': 'erp-proveedores',
  'erp.rutas_venta': 'erp-rutas-venta', 'erp.articulos_sec': 'erp-articulos-sec',
  'erp.cli_env': 'erp-cli-env', 'erp.cltes_rutas_vta': 'erp-cltes-rutas-vta',
};

let fallos = 0;
const comprobar = (t, cond, d) => {
  console.log((cond ? '  OK   ' : '  FALLO') + '  ' + t + (d ? '  -> ' + d : ''));
  if (!cond) fallos++;
};

/** Valor crudo tal y como lo entregaria el driver del ERP para cada tipo. */
const crudo = (col, spec, i) => {
  const tipo = (spec && spec.tipo) || 'texto';
  if (tipo === 'decimal') return 12.5 + i;              // -> "12.5000" con escala 4
  if (tipo === 'entero') return i;
  if (tipo === 'booleano') return i % 2 === 0 ? -1 : 0; // booleano de Access
  if (tipo === 'fecha') return new Date(2025, 9, 28, 0, 0, 0); // 28-oct, medianoche
  return col.endsWith('_id') ? String(i).padStart(3, '0') : col.toUpperCase() + '-' + i;
};

const construir = (trabajo, n) => {
  const { columnas, clave, tipos = {} } = trabajo.origen;
  const entradas = [];
  for (let i = 0; i < n; i++) {
    const fila = {};
    for (const c of columnas) fila[c] = crudo(c, tipos[c], i);
    // Las columnas de clave deben ser distintas entre filas.
    for (const c of clave) fila[c] = (c === 'empresa_id') ? 'GN' : 'K' + i;
    entradas.push({
      clave: serializarClave(fila, clave, tipos),
      hash: hashFila(fila, columnas, tipos),
      fila,
    });
  }
  return entradas;
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

const checksumAgente = (entradas) => crypto.createHash('sha1')
  .update(entradas.map((e) => e.clave + '=' + e.hash).sort().join('\n'), 'utf8').digest('hex');

const enviar = (dataset, cuerpo) => fetch(BASE + '/api/sync/v1/' + dataset, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
  body: JSON.stringify(cuerpo),
}).then(async (r) => ({ estado: r.status, cuerpo: await r.json().catch(() => null) }));

(async () => {
  const pool = require(path.join(APP, 'src/config/db.js'));
  const { DATASETS: REG } = require(path.join(APP, 'src/config/datasets.js'));

  for (const d of DATASETS) await pool.query('TRUNCATE ' + REG[d].tabla);
  await pool.query('TRUNCATE erp.sync_recibidos, erp.datasets');

  console.log('\n=== Los seis datasets, con los tipos reales de cada trabajo ===');
  for (const d of DATASETS) {
    const trabajo = require(path.join(AGENTE, 'trabajos', FICHERO[d] + '.js'));
    const entradas = construir(trabajo, 40);
    const r = await enviar(d, lote(trabajo, entradas, crypto.randomUUID()));
    const ok = r.estado === 200 && r.cuerpo.aplicadas === 40 && r.cuerpo.rechazadas.length === 0;
    comprobar(d.padEnd(22) + ' 40 filas aplicadas', ok,
      ok ? '' : JSON.stringify(r.cuerpo && (r.cuerpo.rechazadas || r.cuerpo)).slice(0, 160));
    comprobar(d.padEnd(22) + ' checksum coincide con el agente',
      r.cuerpo && r.cuerpo.checksum === checksumAgente(entradas), r.cuerpo && r.cuerpo.checksum);
  }

  console.log('\n=== Los tipos que podian salir mal ===');

  // NUMERIC: el agente manda "12.5000" (cadena, escala 4). pg devuelve numeric
  // como cadena, asi que debe volver identico a lo que se hasheo.
  const pv = await pool.query(
    "SELECT precio_vta, por_dto FROM erp.articulos_sec WHERE articulo_id = 'K0'");
  comprobar('NUMERIC conserva la escala 4 (no 12.5)',
    pv.rows[0].precio_vta === '12.5000', JSON.stringify(pv.rows[0].precio_vta));
  comprobar('NUMERIC devuelto como cadena, sin pasar por double',
    typeof pv.rows[0].por_dto === 'string', typeof pv.rows[0].por_dto);

  // status: -1, 0 y 3. Si fuese BOOLEAN, el 3 seria indistinguible del -1.
  await pool.query("UPDATE erp.articulos_sec SET status = 3 WHERE articulo_id = 'K1'");
  const st = await pool.query(
    "SELECT articulo_id, status FROM erp.articulos_sec WHERE articulo_id IN ('K1','K2') ORDER BY 1");
  comprobar('status guarda el 3 y no lo colapsa',
    st.rows[0].status === '3' || st.rows[0].status === 3,
    JSON.stringify(st.rows.map((x) => x.articulo_id + '=' + x.status)));

  // TIMESTAMP: lo enviado fue 2025-10-28T00:00:00.000, sin zona. Tiene que
  // volver con la misma hora de pared, no desplazado.
  const t = await pool.query(
    "SELECT alta_catalogo, to_char(alta_catalogo,'YYYY-MM-DD HH24:MI:SS') AS texto FROM erp.articulos_sec WHERE articulo_id = 'K0'");
  comprobar('TIMESTAMP en la columna es la hora del ERP',
    t.rows[0].texto === '2025-10-28 00:00:00', t.rows[0].texto);
  comprobar('el driver NO lo desplaza al leerlo (parser del OID 1114)',
    typeof t.rows[0].alta_catalogo === 'string' && t.rows[0].alta_catalogo.startsWith('2025-10-28 00:00:00'),
    typeof t.rows[0].alta_catalogo + ': ' + String(t.rows[0].alta_catalogo));

  // Las horas de cli_env, que es donde el desplazamiento pasaria desapercibido.
  const h = await pool.query(
    "SELECT hora_ini1, to_char(hora_ini1,'HH24:MI') AS hhmm FROM erp.cli_env WHERE local_id = 'K0'");
  comprobar('horas de cli_env sin desplazar',
    h.rows[0].hhmm === '00:00' && String(h.rows[0].hora_ini1).includes('00:00:00'),
    'columna=' + h.rows[0].hhmm + '  leido=' + String(h.rows[0].hora_ini1));

  // Booleanos de Access.
  const b = await pool.query(
    "SELECT vta_unid, aliquidar FROM erp.articulos_sec WHERE articulo_id = 'K0'");
  comprobar('booleano de Access -1 -> true', b.rows[0].vta_unid === true);

  // BIGINT que parecia flag.
  const c = await pool.query(
    "SELECT cantapromo, tiempo_servicio FROM erp.articulos_sec a, erp.cli_env e WHERE a.articulo_id='K7' AND e.local_id='K7'");
  comprobar('cantidades como numero, no como flag',
    String(c.rows[0].cantapromo) === '7', JSON.stringify(c.rows[0]));

  console.log('\n=== Claves compuestas que el dato exige ===');
  // rutas_venta: el mismo ruta_ventas_id en dos secciones son DOS filas.
  const tr = require(path.join(AGENTE, 'trabajos/erp-rutas-venta.js'));
  const { columnas, clave, tipos } = tr.origen;
  const dos = ['A', 'B'].map((sec) => {
    const f = {}; for (const c of columnas) f[c] = crudo(c, tipos[c], 1);
    f.empresa_id = 'GN'; f.seccion_id = sec; f.ruta_ventas_id = 'R001';
    return { clave: serializarClave(f, clave, tipos), hash: hashFila(f, columnas, tipos), fila: f };
  });
  const rr = await enviar('erp.rutas_venta', lote(tr, dos, crypto.randomUUID()));
  comprobar('mismo ruta_ventas_id en dos secciones = 2 filas',
    rr.cuerpo.aplicadas === 2 && rr.cuerpo.rechazadas.length === 0,
    JSON.stringify(rr.cuerpo.rechazadas));
  const n = await pool.query("SELECT count(*)::int c FROM erp.rutas_venta WHERE ruta_ventas_id='R001'");
  comprobar('las dos coexisten', n.rows[0].c === 2, 'hay ' + n.rows[0].c);

  console.log('\n=== Volumen: un lote de 500 de la tabla mas ancha ===');
  const ta = require(path.join(AGENTE, 'trabajos/erp-cli-env.js'));
  const muchas = construir(ta, 500);
  const cuerpo = lote(ta, muchas, crypto.randomUUID());
  console.log('    cuerpo: ' + Math.round(JSON.stringify(cuerpo).length / 1024) + ' KB');
  const g = await enviar('erp.cli_env', cuerpo);
  comprobar('500 filas de cli_env aplicadas',
    g.estado === 200 && g.cuerpo.aplicadas === 500,
    JSON.stringify(g.cuerpo && g.cuerpo.aplicadas));

  for (const d of DATASETS) await pool.query('TRUNCATE ' + REG[d].tabla);
  await pool.query('TRUNCATE erp.sync_recibidos, erp.datasets');
  await pool.end();
  console.log(fallos === 0 ? '\nTODO OK' : '\n' + fallos + ' FALLOS');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION: ' + e.stack); process.exit(1); });
