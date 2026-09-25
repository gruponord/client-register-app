// Fase 2 por HTTP: permisos, validacion y aislamiento entre plantas.
// La correccion de las consultas ya se valido contra los datos reales de
// produccion; aqui se prueba la capa de arriba con una cadena sembrada.
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(APP, '.env') });
require('./guarda');   // aborta si la base no es de desarrollo
const jwt = require('jsonwebtoken');
const pool = require(path.join(APP, 'src/config/db.js'));

const BASE = 'http://127.0.0.1:3999';
let fallos = 0;
const ok = (t, c, d) => { console.log((c ? '  OK   ' : '  FALLO') + '  ' + t + (d ? '  -> ' + d : '')); if (!c) fallos++; };
const tok = (id) => jwt.sign({ id, username: 'p', role: 'comercial' }, process.env.JWT_SECRET, { expiresIn: '5m' });
const get = async (ruta, t) => {
  const r = await fetch(BASE + ruta, { headers: { Authorization: 'Bearer ' + t } });
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};
const M = 'PRUEBA_F2';   // marca para poder limpiar

(async () => {
  const limpiar = async () => {
    for (const t of ['clientes', 'cli_env', 'cltes_rutas_vta', 'rutas_venta', 'vendedores']) {
      await pool.query(`DELETE FROM erp.${t} WHERE sync_hash = $1`, [M]);
    }
    await pool.query("DELETE FROM users WHERE username LIKE 'p_f2_%'");
    await pool.query("DELETE FROM plants WHERE code IN ('T','U')");
    await pool.query("DELETE FROM erp.secciones WHERE seccion_id IN ('T','U','V')");
  };
  await limpiar();
  await pool.query(`INSERT INTO plants (code,name,active,logo_path) VALUES ('T','Prueba T',true,'Z.jpg'),('U','Prueba U',true,'Y.jpg')
                    ON CONFLICT (code) DO UPDATE SET active = true`);
  for (const sec of ['T', 'U']) {
    await pool.query(
      `INSERT INTO erp.secciones (empresa_id,seccion_id,nombre,activo,sync_clave,sync_hash)
       VALUES ('GN',$1,$2,true,$3,$4) ON CONFLICT DO NOTHING`, [sec, 'Sec ' + sec, 'S:' + sec, M]);
  }

  const ins = (tabla, cols, vals) => pool.query(
    `INSERT INTO erp.${tabla} (${cols.join(',')}, activo, sync_clave, sync_hash)
     VALUES (${vals.map((_, i) => '$' + (i + 1)).join(',')}, true, $${vals.length + 1}, $${vals.length + 2})`,
    [...vals, tabla + ':' + vals.join(':'), M]
  );

  // Dos plantas, dos vendedores, tres clientes.
  await ins('vendedores', ['empresa_id', 'seccion_id', 'vendedor_id', 'nombre', 'email', 'baja', 'activoreal'],
    ['GN', 'T', '801', 'ANA DE ZUBILLAGA', 'ana.f2@zuvillaga.com', false, true]);
  await ins('vendedores', ['empresa_id', 'seccion_id', 'vendedor_id', 'nombre', 'email', 'baja', 'activoreal'],
    ['GN', 'U', '802', 'BEA DE AYESTARAN', 'bea.f2@casaayestaran.com', false, true]);
  await ins('rutas_venta', ['empresa_id', 'seccion_id', 'ruta_ventas_id', 'descripcion', 'vendedor_id'],
    ['GN', 'T', 'R01', 'no se usa', '801']);
  await ins('rutas_venta', ['empresa_id', 'seccion_id', 'ruta_ventas_id', 'descripcion', 'vendedor_id'],
    ['GN', 'U', 'R01', 'no se usa', '802']);   // mismo id de ruta en otra seccion, a proposito

  const cliente = async (id, nombre, poblacion, seccion, dias, localPobl) => {
    await ins('clientes', ['empresa_id', 'cliente_id', 'nombre', 'poblacion', 'secpref_id', 'estado'],
      ['GN', id, nombre, poblacion, seccion, false]);
    await ins('cli_env', ['empresa_id', 'cliente_id', 'local_id', 'nombre', 'poblacion'],
      ['GN', id, '0', nombre, localPobl]);   // poblacion vacia -> debe caer a clientes
    await ins('cltes_rutas_vta', ['empresa_id', 'cliente_id', 'local_id', 'origen_id', 'ruta_venta_id', 'period_semana'],
      ['GN', id, '0', '0', 'R01', dias]);
  };
  await cliente('C001', 'BAR LA PRUEBA', 'BILBAO', 'T', '1,4', null);
  await cliente('C002', 'CAFE SEGUNDO', 'GETXO', 'T', '7', '');
  await cliente('C003', 'BAR DE AYESTARAN', 'IRUN', 'U', '1', null);

  const crearUsuario = async (sufijo, email) => (await pool.query(
    `INSERT INTO users (username,password_hash,email,full_name,role,active,utilities)
     VALUES ($1,'x',$2,$3,'comercial',true,$4) RETURNING id`,
    ['p_f2_' + sufijo, email, 'P ' + sufijo, JSON.stringify(['ofertas'])])).rows[0].id;

  const uZ = await crearUsuario('z', 'ana.f2@zuvillaga.com');
  const tZ = tok(uZ);

  console.log('\n1) Validacion de la planta');
  ok('sin seccion -> 400', (await get('/api/offers/clientes?nombre=BAR', tZ)).estado === 400);
  ok('planta ajena -> 403', (await get('/api/offers/clientes?seccion=U&nombre=BAR', tZ)).estado === 403);
  ok('planta propia -> 200', (await get('/api/offers/clientes?seccion=T&nombre=BAR', tZ)).estado === 200);

  console.log('\n2) Validacion de los criterios');
  const sin = await get('/api/offers/clientes?seccion=T', tZ);
  ok('sin ningun criterio -> 400', sin.estado === 400 && sin.cuerpo.code === 'SIN_CRITERIO', JSON.stringify(sin.cuerpo));
  ok('dia inventado -> 400', (await get('/api/offers/clientes?seccion=T&dia=99', tZ)).estado === 400);

  console.log('\n3) Las cuatro busquedas');
  const porNombre = await get('/api/offers/clientes?seccion=T&nombre=bar', tZ);
  ok('por nombre, sin distinguir mayusculas', porNombre.cuerpo.total === 1, JSON.stringify(porNombre.cuerpo.total));
  const porPobl = await get('/api/offers/clientes?seccion=T&poblacion=bilbao', tZ);
  ok('por poblacion', porPobl.cuerpo.total === 1);
  const porCod = await get('/api/offers/clientes?seccion=T&codigo=C00', tZ);
  ok('por codigo, por principio de cadena', porCod.cuerpo.total === 2, JSON.stringify(porCod.cuerpo.total));
  const porDia = await get('/api/offers/clientes?seccion=T&dia=4', tZ);
  ok('por dia dentro de una lista con coma', porDia.cuerpo.total === 1 &&
     porDia.cuerpo.clientes[0].cliente_id === 'C001', JSON.stringify(porDia.cuerpo.clientes.map((c) => c.cliente_id)));
  const domingo = await get('/api/offers/clientes?seccion=T&dia=7', tZ);
  ok('el domingo encuentra al segundo', domingo.cuerpo.total === 1 &&
     domingo.cuerpo.clientes[0].cliente_id === 'C002');

  console.log('\n3b) El cuadro de texto unico busca en los tres campos');
  const porTexto = async (t) =>
    (await get('/api/offers/clientes?seccion=T&texto=' + encodeURIComponent(t), tZ)).cuerpo;
  const tNombre = await porTexto('bar');
  ok('encuentra por nombre', tNombre.total === 1 && tNombre.clientes[0].cliente_id === 'C001',
    JSON.stringify(tNombre.clientes.map((c) => c.cliente_id)));
  const tPobl = await porTexto('getxo');
  ok('encuentra por poblacion', tPobl.total === 1 && tPobl.clientes[0].cliente_id === 'C002',
    JSON.stringify(tPobl.clientes.map((c) => c.cliente_id)));
  const tCod = await porTexto('C00');
  ok('encuentra por codigo, por principio', tCod.total === 2, String(tCod.total));
  ok('sin resultados devuelve 0 limpio', (await porTexto('zzz-no-existe')).total === 0);
  const tCombi = await get('/api/offers/clientes?seccion=T&vendedor=801&texto=getxo', tZ);
  ok('el texto acota dentro de la ruta', tCombi.cuerpo.total === 1, String(tCombi.cuerpo.total));
  const tOtra = await get('/api/offers/clientes?seccion=T&vendedor=801&texto=ayestaran', tZ);
  ok('y no se cuela el de la otra planta', tOtra.cuerpo.total === 0, String(tOtra.cuerpo.total));

  console.log('\n4) El cliente de la otra planta no se ve nunca');
  ok('C003 no aparece buscando BAR en Z',
    !porNombre.cuerpo.clientes.some((c) => c.cliente_id === 'C003'),
    JSON.stringify(porNombre.cuerpo.clientes.map((c) => c.cliente_id)));

  console.log('\n5) Forma de la respuesta');
  const c1 = porDia.cuerpo.clientes[0];
  ok('ruta etiquetada con el vendedor', c1.ruta === 'Ruta de ANA DE ZUBILLAGA', c1.ruta);
  ok('dias traducidos', JSON.stringify(c1.dias_visita) === '["Lunes","Jueves"]', JSON.stringify(c1.dias_visita));
  ok('poblacion cae a clientes si cli_env la trae vacia', c1.poblacion === 'BILBAO', c1.poblacion);
  const c2 = domingo.cuerpo.clientes[0];
  ok('y tambien si viene como cadena vacia', c2.poblacion === 'GETXO', c2.poblacion);

  console.log('\n6) Desplegable de rutas');
  const rutas = await get('/api/offers/rutas?seccion=T', tZ);
  ok('una entrada por vendedor', rutas.cuerpo.length === 1, JSON.stringify(rutas.cuerpo));
  ok('con su etiqueta y sus rutas', rutas.cuerpo[0].etiqueta === 'Ruta de ANA DE ZUBILLAGA' &&
     rutas.cuerpo[0].rutas.includes('R01'), JSON.stringify(rutas.cuerpo[0]));
  ok('y el recuento de clientes', rutas.cuerpo[0].clientes === 2, String(rutas.cuerpo[0].clientes));

  console.log('\n7) Filtro por vendedor');
  const porVend = await get('/api/offers/clientes?seccion=T&vendedor=801', tZ);
  ok('trae los dos clientes de Ana', porVend.cuerpo.total === 2, String(porVend.cuerpo.total));

  console.log('\n8) Contexto: el catalogo de dias viaja con el');
  const ctx = await get('/api/offers/contexto', tZ);
  ok('9 dias con nombre', ctx.cuerpo.dias_visita.length === 9, JSON.stringify(ctx.cuerpo.dias_visita.slice(5)));

  console.log('\n9) Usuario sin vendedor: puede trabajar con las DOS plantas');
  const uLibre = await crearUsuario('libre', 'nadie.f2@gruponord.com');
  const tL = tok(uLibre);
  const ctxL = await get('/api/offers/contexto', tL);
  // Se comprueba que ESTEN las dos de prueba, no que sean las unicas: si la base
  // de desarrollo tiene importada la muestra, tambien salen las cuatro reales.
  ok('no vinculado, y le ofrecen las dos de prueba',
    ctxL.cuerpo.vinculado === false &&
    ['T', 'U'].every((s) => ctxL.cuerpo.plantas.some((p) => p.seccion_id === s)),
    JSON.stringify(ctxL.cuerpo.plantas.map((p) => p.seccion_id)));

  const enZ = await get('/api/offers/clientes?seccion=T&nombre=BAR', tL);
  const enY = await get('/api/offers/clientes?seccion=U&nombre=BAR', tL);
  ok('busca en Z', enZ.estado === 200 && enZ.cuerpo.total === 1,
    'HTTP ' + enZ.estado + ' total=' + (enZ.cuerpo && enZ.cuerpo.total));
  ok('y tambien en Y, que al vinculado le daba 403',
    enY.estado === 200 && enY.cuerpo.total === 1,
    'HTTP ' + enY.estado + ' total=' + (enY.cuerpo && enY.cuerpo.total));
  ok('cada planta le da su cliente, no los dos',
    enZ.cuerpo.clientes[0].cliente_id === 'C001' && enY.cuerpo.clientes[0].cliente_id === 'C003',
    enZ.cuerpo.clientes[0].cliente_id + ' / ' + enY.cuerpo.clientes[0].cliente_id);
  const rutasL = await get('/api/offers/rutas?seccion=U', tL);
  ok('y el desplegable de rutas de Y', rutasL.estado === 200 &&
    rutasL.cuerpo[0].etiqueta === 'Ruta de BEA DE AYESTARAN', JSON.stringify(rutasL.cuerpo));
  ok('el vinculado a Z sigue sin poder entrar en Y',
    (await get('/api/offers/clientes?seccion=U&nombre=BAR', tZ)).estado === 403);

  await limpiar();
  await pool.end();
  console.log(fallos === 0 ? '\nTODO OK' : '\n' + fallos + ' FALLOS');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION: ' + e.stack); process.exit(1); });
