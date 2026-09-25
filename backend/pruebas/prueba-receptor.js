// Prueba de punta a punta del receptor, usando el hash.js REAL del agente para
// construir los lotes: asi se comprueba que las dos puntas calculan el mismo
// checksum, que es lo unico que no se puede verificar mirando el codigo.
'use strict';

const path = require('path');
const zlib = require('zlib');
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

const { hashFila, serializarClave, normalizarFila } = require(path.join(AGENTE, 'src/hash.js'));

const BASE = 'http://127.0.0.1:3999';
const API_KEY = 'clave-de-prueba-e2e';

// Mismo trabajo que usa el agente de verdad.
const trabajo = require(path.join(AGENTE, 'trabajos/erp-vendedores.js'));
const { columnas, clave, tipos } = trabajo.origen;

// Filas "crudas" tal y como las devuelve el ERP: booleanos de Access (-1/0),
// CHAR con relleno de espacios.
const CRUDAS = [
  { empresa_id: 'GN', seccion_id: 'M ', vendedor_id: '001', nombre: 'Ana Ruiz  ', email: 'ana@x.com', zona: 'NORTE', vend_resp_id: null, colaborador_id: 7, movilidad_prev: null, baja: 0, activoreal: -1 },
  { empresa_id: 'GN', seccion_id: 'M', vendedor_id: '002', nombre: 'Luis Gil', email: null, zona: 'SUR', vend_resp_id: '001', colaborador_id: null, movilidad_prev: null, baja: -1, activoreal: -1 },
  { empresa_id: 'GN', seccion_id: 'B', vendedor_id: '003', nombre: 'VENTAS DIRECTAS', email: null, zona: null, vend_resp_id: null, colaborador_id: null, movilidad_prev: null, baja: 0, activoreal: 0 },
];

const entrada = (cruda) => ({
  clave: serializarClave(cruda, clave, tipos),
  hash: hashFila(cruda, columnas, tipos),
  fila: cruda,
});

// Copia de construirLote() del driver del agente.
const construirLote = ({ runId, modo, entradas, bajas, lote, lotes }) => ({
  runId,
  dataset: trabajo.dataset,
  modo,
  generadoEn: new Date().toISOString(),
  lote,
  lotes,
  filas: (entradas || []).map((e) => {
    const n = normalizarFila(e.fila, columnas, tipos);
    const _clave = {};
    for (const c of clave) _clave[c] = n[c];
    return Object.assign({ _clave, _claveId: e.clave, _hash: e.hash }, n);
  }),
  bajas: (bajas || []).map((c) => ({ _claveId: c })),
});

// Checksum del lado del agente: la misma definicion del contrato §4, calculada
// sobre lo que el agente cree que tiene el destino.
const checksumAgente = (entradas) => {
  const lineas = entradas
    .map((e) => e.clave + '=' + e.hash)
    .sort(); // orden de bytes: Array.sort() compara unidades UTF-16, aqui ASCII
  return crypto.createHash('sha1').update(lineas.join('\n'), 'utf8').digest('hex');
};

const enviar = async (ruta, cuerpo, opciones = {}) => {
  const json = JSON.stringify(cuerpo);
  const cabeceras = { 'Content-Type': 'application/json', 'X-Api-Key': opciones.apiKey || API_KEY };
  let datos = json;
  if (opciones.gzip) {
    datos = zlib.gzipSync(json);
    cabeceras['Content-Encoding'] = 'gzip';
  }
  const r = await fetch(BASE + ruta, { method: 'POST', headers: cabeceras, body: datos });
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};

const traer = async (ruta, apiKey) => {
  const r = await fetch(BASE + ruta, { headers: { 'X-Api-Key': apiKey || API_KEY } });
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};

let fallos = 0;
const comprobar = (etiqueta, ok, detalle) => {
  console.log((ok ? '  OK   ' : '  FALLO') + '  ' + etiqueta + (detalle ? '  -> ' + detalle : ''));
  if (!ok) fallos++;
};

(async () => {
  require('dotenv').config({ path: path.join(APP, '.env') });
  require('./guarda');   // aborta si la base no es de desarrollo
  const pool = require(path.join(APP, 'src/config/db.js'));
  await pool.query('TRUNCATE erp.vendedores, erp.secciones, erp.datasets, erp.sync_recibidos');

  const entradas = CRUDAS.map(entrada);
  const runId1 = crypto.randomUUID();

  console.log('\n1) Delta inicial, en dos lotes y con gzip');
  const l1 = await enviar('/api/sync/v1/erp.vendedores',
    construirLote({ runId: runId1, modo: 'delta', entradas: entradas.slice(0, 2), lote: 1, lotes: 2 }),
    { gzip: true });
  comprobar('lote 1 aceptado', l1.estado === 200 && l1.cuerpo.aplicadas === 2, JSON.stringify(l1.cuerpo));
  comprobar('sin checksum en lote intermedio', !l1.cuerpo.checksum);

  const l2 = await enviar('/api/sync/v1/erp.vendedores',
    construirLote({ runId: runId1, modo: 'delta', entradas: entradas.slice(2), lote: 2, lotes: 2 }));
  comprobar('lote 2 aceptado', l2.estado === 200 && l2.cuerpo.aplicadas === 1, JSON.stringify(l2.cuerpo));

  const esperado = checksumAgente(entradas);
  comprobar('CHECKSUM coincide con el del agente', l2.cuerpo.checksum === esperado,
    'agente=' + esperado + ' receptor=' + l2.cuerpo.checksum);

  console.log('\n2) Normalizacion: el receptor guarda lo que le llega');
  const f = await pool.query("SELECT * FROM erp.vendedores WHERE vendedor_id='001'");
  comprobar('booleano de Access -1 -> true', f.rows[0].activoreal === true);
  comprobar('booleano 0 -> false', f.rows[0].baja === false);
  comprobar('CHAR sin relleno', f.rows[0].nombre === 'Ana Ruiz', JSON.stringify(f.rows[0].nombre));
  comprobar('seccion_id sin relleno', f.rows[0].seccion_id === 'M', JSON.stringify(f.rows[0].seccion_id));
  comprobar('NULL sigue siendo NULL', f.rows[0].movilidad_prev === null);
  comprobar('sync_run sellado', f.rows[0].sync_run === runId1);

  console.log('\n3) No se filtra nada: las 3 filas estan, incluidas baja y no-real');
  const n = await pool.query('SELECT COUNT(*)::int c FROM erp.vendedores WHERE activo');
  comprobar('3 filas activas', n.rows[0].c === 3, 'hay ' + n.rows[0].c);

  console.log('\n4) Idempotencia por (runId, lote)');
  const rep = await enviar('/api/sync/v1/erp.vendedores',
    construirLote({ runId: runId1, modo: 'delta', entradas: entradas.slice(0, 2), lote: 1, lotes: 2 }));
  comprobar('reintento marcado como repetido', rep.cuerpo.repetido === true);
  comprobar('misma respuesta', rep.cuerpo.aplicadas === 2);
  const n2 = await pool.query('SELECT COUNT(*)::int c FROM erp.vendedores');
  comprobar('no ha duplicado filas', n2.rows[0].c === 3);

  console.log('\n5) Baja explicita (delta): logica, no DELETE');
  const runId2 = crypto.randomUUID();
  const baja = await enviar('/api/sync/v1/erp.vendedores',
    construirLote({ runId: runId2, modo: 'delta', entradas: [], bajas: [entradas[2].clave], lote: 1, lotes: 1 }));
  comprobar('1 baja aplicada', baja.cuerpo.bajas === 1, JSON.stringify(baja.cuerpo));
  const b = await pool.query("SELECT activo FROM erp.vendedores WHERE vendedor_id='003'");
  comprobar('la fila sigue ahi, inactiva', b.rowCount === 1 && b.rows[0].activo === false);
  comprobar('checksum ya sin la fila de baja',
    baja.cuerpo.checksum === checksumAgente(entradas.slice(0, 2)),
    baja.cuerpo.checksum);

  console.log('\n6) Filas invalidas: rechazo por fila, no fallo global');
  const runId3 = crypto.randomUUID();
  const malo = construirLote({ runId: runId3, modo: 'delta', entradas: entradas.slice(0, 1), lote: 1, lotes: 1 });
  malo.filas.push({ _clave: { empresa_id: 'GN' }, _claveId: 'x', _hash: 'y', empresa_id: 'GN', seccion_id: '', vendedor_id: '9' });
  malo.filas.push({ empresa_id: 'GN', seccion_id: 'M', vendedor_id: '8' }); // sin _hash
  // Rechazo del lado de PostgreSQL, con _claveId valido: un BIGINT que recibe
  // texto. Es el caso en el que el agente NECESITA que le devolvamos el claveId.
  const conClaveId = entrada({
    empresa_id: 'GN', seccion_id: 'M ', vendedor_id: '007', nombre: 'Con relleno  ',
    email: null, zona: null, vend_resp_id: null, colaborador_id: null,
    movilidad_prev: null, baja: 0, activoreal: -1,
  });
  const filaMala = construirLote({ runId: runId3, modo: 'delta', entradas: [conClaveId], lote: 1, lotes: 1 }).filas[0];
  filaMala.colaborador_id = 'no-es-un-numero';
  malo.filas.push(filaMala);

  const mixto = await enviar('/api/sync/v1/erp.vendedores', malo);
  comprobar('200 aunque haya rechazos', mixto.estado === 200);
  comprobar('1 aplicada', mixto.cuerpo.aplicadas === 1, JSON.stringify(mixto.cuerpo.aplicadas));
  comprobar('3 rechazadas con motivo', mixto.cuerpo.rechazadas.length === 3,
    JSON.stringify(mixto.cuerpo.rechazadas.map((x) => x.motivo)));

  // Lo que pide el agente: emparejar por claveId y no por la clave desglosada,
  // que con un CHAR con relleno no coincide con la clave cruda del ERP.
  const devuelto = mixto.cuerpo.rechazadas.find((x) => x.motivo.includes('bigint'));
  comprobar('el rechazo de la BD devuelve claveId',
    devuelto && devuelto.claveId === conClaveId.clave,
    devuelto ? String(devuelto.claveId) : 'no encontrado');
  comprobar('todo rechazo trae el campo claveId',
    mixto.cuerpo.rechazadas.every((x) => 'claveId' in x));
  // El agente emparejaria esta fila sin ambiguedad: 'M ' del ERP frente a 'M'
  // normalizada haria fallar la comparacion por clave desglosada.
  comprobar('el claveId devuelto es el serializado, no la clave cruda',
    devuelto && devuelto.claveId.includes('T:1:M') && devuelto.clave.seccion_id === 'M',
    devuelto ? devuelto.claveId.slice(0, 60) : '');

  console.log('\n7) Modo completo + cierre');
  const runId4 = crypto.randomUUID();
  // Solo vienen 2 de las 3: la tercera debe caer al cerrar.
  const c1 = await enviar('/api/sync/v1/erp.vendedores',
    construirLote({ runId: runId4, modo: 'completo', entradas: entradas.slice(0, 2), lote: 1, lotes: 1 }));
  comprobar('lote completo aceptado', c1.cuerpo.aplicadas === 2);
  comprobar('sin checksum antes del cierre', !c1.cuerpo.checksum);
  const antes = await pool.query('SELECT COUNT(*)::int c FROM erp.vendedores WHERE activo');
  comprobar('nada desactivado antes del cierre', antes.rows[0].c === 2 || antes.rows[0].c === 3,
    'activas=' + antes.rows[0].c);

  const cierre = await enviar('/api/sync/v1/erp.vendedores/cerrar', { runId: runId4, lotes: 1 });
  comprobar('cierre OK', cierre.estado === 200, JSON.stringify(cierre.cuerpo));
  comprobar('quedan 2 activas', cierre.cuerpo.filas === 2);
  comprobar('checksum del cierre coincide con el agente',
    cierre.cuerpo.checksum === checksumAgente(entradas.slice(0, 2)), cierre.cuerpo.checksum);

  console.log('\n8) Verificacion que hace el agente al final del ciclo');
  const ver = await traer('/api/sync/v1/erp.vendedores/checksum');
  comprobar('GET /checksum coincide', ver.cuerpo.checksum === checksumAgente(entradas.slice(0, 2)),
    JSON.stringify(ver.cuerpo));

  console.log('\n9) Dataset vacio -> SHA-1 de la cadena vacia');
  const vacio = await traer('/api/sync/v1/erp.secciones/checksum');
  comprobar('checksum del vacio', vacio.cuerpo.checksum === 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
    vacio.cuerpo.checksum);

  console.log('\n10) Seguridad y errores');
  const sinClave = await enviar('/api/sync/v1/erp.vendedores', { runId: crypto.randomUUID() }, { apiKey: 'mala' });
  comprobar('clave invalida -> 401', sinClave.estado === 401);
  const desconocido = await enviar('/api/sync/v1/erp.jamas_declarado', { runId: crypto.randomUUID() });
  comprobar('dataset desconocido -> 404', desconocido.estado === 404);
  const sinRun = await enviar('/api/sync/v1/erp.vendedores', { filas: [] });
  comprobar('sin runId -> 400', sinRun.estado === 400);
  const runMalo = await enviar('/api/sync/v1/erp.vendedores', { runId: 'no-es-uuid', filas: [] });
  comprobar('runId no UUID -> 400', runMalo.estado === 400);
  const estadoNoAuth = await fetch(BASE + '/api/sync/v1/estado');
  comprobar('estado sin JWT -> 401', estadoNoAuth.status === 401);

  console.log('\n11) Frescura registrada por dataset');
  const d = await pool.query('SELECT * FROM erp.datasets');
  const fv = d.rows.find((x) => x.dataset === 'erp.vendedores');
  comprobar('hay fila de frescura para erp.vendedores', Boolean(fv), JSON.stringify(d.rows.map(x=>x.dataset)));
  comprobar('modo del ultimo envio', fv && fv.modo === 'completo', fv && fv.modo);

  console.log('\n12) Lote grande sin gzip (por encima de los 100kb de express.json)');
  const muchas = [];
  for (let i = 0; i < 500; i++) {
    muchas.push(entrada({
      empresa_id: 'GN', seccion_id: 'Z', vendedor_id: String(i).padStart(4, '0'),
      nombre: 'Vendedor de prueba numero ' + i, email: 'v' + i + '@ejemplo.com',
      zona: 'ZONA DE PRUEBAS CON TEXTO LARGO PARA ABULTAR EL CUERPO ' + i,
      vend_resp_id: null, colaborador_id: i, movilidad_prev: null, baja: 0, activoreal: -1,
    }));
  }
  const cuerpoGrande = construirLote({ runId: crypto.randomUUID(), modo: 'delta', entradas: muchas, lote: 1, lotes: 1 });
  console.log('    tamano del cuerpo: ' + Math.round(JSON.stringify(cuerpoGrande).length / 1024) + ' KB');
  const grande = await enviar('/api/sync/v1/erp.vendedores', cuerpoGrande);
  comprobar('500 filas aplicadas', grande.estado === 200 && grande.cuerpo.aplicadas === 500,
    JSON.stringify(grande.cuerpo && grande.cuerpo.aplicadas));

  await pool.query('TRUNCATE erp.vendedores, erp.secciones, erp.datasets, erp.sync_recibidos');
  await pool.end();

  console.log(fallos === 0 ? '\nTODO OK' : '\n' + fallos + ' COMPROBACIONES FALLIDAS');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION:', e); process.exit(1); });
