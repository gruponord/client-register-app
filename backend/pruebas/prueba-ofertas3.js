// Fase 3 por HTTP: catalogo, filtros y precios. La correccion de las consultas
// se valido contra produccion; aqui la capa de arriba con datos sembrados.
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(APP, '.env') });
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
const M = 'PRUEBA_F3';

(async () => {
  const limpiar = async () => {
    for (const t of ['articulos', 'articulos_sec', 'familias', 'proveedores', 'vendedores']) {
      await pool.query(`DELETE FROM erp.${t} WHERE sync_hash = $1`, [M]);
    }
    await pool.query("DELETE FROM users WHERE username LIKE 'p_f3_%'");
  };
  await limpiar();

  const ins = (tabla, cols, vals) => pool.query(
    `INSERT INTO erp.${tabla} (${cols.join(',')}, activo, sync_clave, sync_hash)
     VALUES (${vals.map((_, i) => '$' + (i + 1)).join(',')}, true, $${vals.length + 1}, $${vals.length + 2})`,
    [...vals, tabla + ':' + vals.join(':'), M]
  );

  await ins('vendedores', ['empresa_id', 'seccion_id', 'vendedor_id', 'nombre', 'email', 'baja', 'activoreal'],
    ['GN', 'T', '701', 'CARLOS DE PRUEBA', 'carlos.f3@zuvillaga.com', false, true]);
  await ins('familias', ['empresa_id', 'familia_id', 'descripcion'], ['GN', 'F1', 'Cervezas']);
  await ins('familias', ['empresa_id', 'familia_id', 'descripcion'], ['GN', 'F2', 'Ibéricos']);
  await ins('proveedores', ['empresa_id', 'proveedor_id', 'xnombre'], ['GN', 'P1', 'Cervezas del Norte SL']);
  await ins('proveedores', ['empresa_id', 'proveedor_id', 'xnombre'], ['GN', 'P2', 'Jamones Serranos SA']);

  const articulo = async (id, desc, fam, prov, unidad, peso, uds) =>
    ins('articulos', ['empresa_id', 'articulo_id', 'descripcion', 'familia_id', 'proveedor_id',
      'unidad_prin_id', 'peso_neto', 'unidades_agrup'], ['GN', id, desc, fam, prov, unidad, peso, uds]);
  const precio = async (id, sec, p, dto) =>
    ins('articulos_sec', ['empresa_id', 'articulo_id', 'seccion_id', 'precio_vta', 'por_dto',
      'status', 'vta_tpv', 'bajopedido'], ['GN', id, sec, p, dto, 0, true, false]);

  // Una lata, un jamon de kilos, un envase sin precio y uno de otra planta.
  await articulo('A001', 'LATA CERVEZA RUBIA 0,33L', 'F1', 'P1', 'U', null, 24);
  await precio('A001', 'T', 0.6902, 5);
  await articulo('A002', 'JAMON DE PRUEBA 5,5K', 'F2', 'P2', 'K', 5.5, 2);
  await precio('A002', 'T', 26.95, 10);
  await articulo('A003', 'ENVASE BARRIL VACIO', 'F1', 'P1', 'U', null, 1);
  await precio('A003', 'T', 0, 0);            // sin precio: no debe aparecer
  await articulo('A004', 'LATA SOLO DE AYESTARAN', 'F1', 'P1', 'U', null, 24);
  await precio('A004', 'U', 1.11, 0);         // otra planta
  await articulo('A005', 'ARTICULO NO VENDIBLE', 'F1', 'P1', 'U', null, 6);
  await ins('articulos_sec', ['empresa_id', 'articulo_id', 'seccion_id', 'precio_vta', 'por_dto',
    'status', 'vta_tpv'], ['GN', 'A005', 'T', 9.99, 0, 3, true]);   // status 3: fuera

  const uZ = (await pool.query(
    `INSERT INTO users (username,password_hash,email,full_name,role,active,utilities)
     VALUES ('p_f3_z','x','carlos.f3@zuvillaga.com','P','comercial',true,$1) RETURNING id`,
    [JSON.stringify(['ofertas'])])).rows[0].id;
  const t = tok(uZ);

  console.log('\n1) El catalogo de la planta');
  const cat = await get('/api/offers/articulos?seccion=T', t);
  ok('200 y solo los vendibles con precio', cat.estado === 200 && cat.cuerpo.total === 2,
    'total=' + (cat.cuerpo && cat.cuerpo.total));
  const ids = cat.cuerpo.articulos.map((a) => a.articulo_id);
  ok('el envase sin precio no esta', !ids.includes('A003'), JSON.stringify(ids));
  ok('el de status 3 no esta', !ids.includes('A005'));
  ok('el de otra planta no esta', !ids.includes('A004'));

  console.log('\n2) Los cuatro filtros');
  ok('por familia', (await get('/api/offers/articulos?seccion=T&familia=F2', t)).cuerpo.total === 1);
  ok('por proveedor', (await get('/api/offers/articulos?seccion=T&proveedor=P1', t)).cuerpo.total === 1);
  ok('por descripcion, sin mayusculas',
    (await get('/api/offers/articulos?seccion=T&descripcion=jamon', t)).cuerpo.total === 1);
  ok('por codigo, por principio',
    (await get('/api/offers/articulos?seccion=T&codigo=A00', t)).cuerpo.total === 2);
  ok('familia + descripcion combinados',
    (await get('/api/offers/articulos?seccion=T&familia=F1&descripcion=jamon', t)).cuerpo.total === 0);

  console.log('\n2b) El cuadro de texto unico: descripcion y codigo');
  // Ojo: el parametro se llama q y no t, que es el token de la suite.
  const porTexto = async (q) =>
    (await get('/api/offers/articulos?seccion=T&texto=' + encodeURIComponent(q), t)).cuerpo;
  ok('por descripcion, sin mayusculas', (await porTexto('jamon')).total === 1,
    String((await porTexto('jamon')).total));
  ok('por codigo completo', (await porTexto('A002')).total === 1);
  ok('por principio de codigo', (await porTexto('A00')).total === 2, String((await porTexto('A00')).total));
  ok('sin resultados, 0 limpio', (await porTexto('zzz-nada')).total === 0);
  const conFam = await get('/api/offers/articulos?seccion=T&familia=F2&texto=jamon', t);
  ok('el texto se combina con la familia', conFam.cuerpo.total === 1, String(conFam.cuerpo.total));
  const otraFam = await get('/api/offers/articulos?seccion=T&familia=F1&texto=jamon', t);
  ok('y acota de verdad', otraFam.cuerpo.total === 0, String(otraFam.cuerpo.total));
  ok('el texto no salta el filtro de vendibles',
    (await porTexto('ENVASE')).total === 0 && (await porTexto('FUERA CATALOGO')).total === 0);

  console.log('\n3) Desplegables');
  const f = await get('/api/offers/filtros?seccion=T', t);
  ok('solo familias con articulos vendibles', f.cuerpo.familias.length === 2,
    JSON.stringify(f.cuerpo.familias.map((x) => x.nombre + '(' + x.articulos + ')')));
  ok('los nombres se resuelven', f.cuerpo.familias.some((x) => x.nombre === 'Ibéricos'));
  ok('proveedores con su nombre',
    f.cuerpo.proveedores.some((x) => x.nombre === 'Jamones Serranos SA'),
    JSON.stringify(f.cuerpo.proveedores.map((x) => x.nombre)));

  console.log('\n4) Precios: la lata (unidad U)');
  const lata = cat.cuerpo.articulos.find((a) => a.articulo_id === 'A001');
  ok('no es kilo', lata.es_kilo === false);
  ok('sin precio por kilo', lata.precio_kilo === null, String(lata.precio_kilo));
  ok('precio unidad 0,69', lata.precio_unidad === 0.69, String(lata.precio_unidad));
  ok('precio caja 16,56 (0,69 x 24)', lata.precio_caja === 16.56, String(lata.precio_caja));
  // El catalogo NO aplica descuento: por_dto es el TOPE autorizado, no una
  // tarifa. El final coincide con el de tarifa hasta que el comercial decida.
  ok('tope del 5% informado', lata.dto_max === 5, String(lata.dto_max));
  ok('sin descuento aplicado', lata.dto_pct === 0, String(lata.dto_pct));
  ok('final = tarifa: 0,69', lata.precio_final_unidad === 0.69, String(lata.precio_final_unidad));
  ok('caja de 24 -> 16,56', lata.precio_final_caja === 16.56, String(lata.precio_final_caja));
  ok('sin peso', lata.peso_neto === null);

  console.log('\n5) Precios: el jamon (unidad K, precio por kilo)');
  const jam = cat.cuerpo.articulos.find((a) => a.articulo_id === 'A002');
  ok('es kilo', jam.es_kilo === true);
  ok('trae el peso para poder avisar', Number(jam.peso_neto) === 5.5, String(jam.peso_neto));
  ok('precio por kilo 26,95', jam.precio_kilo === 26.95, String(jam.precio_kilo));
  ok('unidad = 26,95 x 5,5 = 148,23', jam.precio_unidad === 148.23, String(jam.precio_unidad));
  ok('precio caja 296,46', jam.precio_caja === 296.46, String(jam.precio_caja));
  ok('tope del 10% informado', jam.dto_max === 10, String(jam.dto_max));
  ok('sin descuento aplicado', jam.dto_pct === 0, String(jam.dto_pct));
  ok('kilo final = tarifa: 26,95', jam.precio_final_kilo === 26.95, String(jam.precio_final_kilo));
  ok('unidad final = tarifa: 148,23', jam.precio_final_unidad === 148.23, String(jam.precio_final_unidad));
  ok('caja de 2 -> 296,46', jam.precio_final_caja === 296.46, String(jam.precio_final_caja));

  console.log('\n5b) Y cuando SI se aplica descuento, el redondeo encadenado');
  // Estas cifras se probaban aqui cuando el descuento venia aplicado de serie.
  // Siguen siendo el corazon del calculo, asi que se comprueban directamente
  // sobre calcularLinea en vez de perderlas.
  const calc = require(path.join(APP, 'src/services/precios.service.js')).calcularLinea;
  const l5 = calc({ unidad: 'U', precio_vta: 0.69, unidades_caja: 24, dto_pct: 5 });
  ok('lata al 5%: unidad 0,66', l5.precio_final_unidad === 0.66, String(l5.precio_final_unidad));
  ok('lata al 5%: caja 15,84', l5.precio_final_caja === 15.84, String(l5.precio_final_caja));
  const l10 = calc({ unidad: 'K', precio_vta: 26.95, peso_neto: 5.5, unidades_caja: 2, dto_pct: 10 });
  ok('jamon al 10%: kilo 24,26', l10.precio_final_kilo === 24.26, String(l10.precio_final_kilo));
  ok('jamon al 10%: unidad 133,41', l10.precio_final_unidad === 133.41, String(l10.precio_final_unidad));
  ok('jamon al 10%: caja 266,82', l10.precio_final_caja === 266.82, String(l10.precio_final_caja));

  console.log('\n6) Las cuentas cuadran a mano, que es el objetivo');
  for (const a of [lata, jam]) {
    const aMano = Math.round(a.precio_unidad * (1 - a.dto_pct / 100) * 100) / 100;
    ok('  ' + a.articulo_id + ': unidad x (1-dto) = final', aMano === a.precio_final_unidad,
      a.precio_unidad + ' x ' + (1 - a.dto_pct / 100) + ' = ' + aMano);
    ok('  ' + a.articulo_id + ': final x unidades = caja',
      Math.round(a.precio_final_unidad * a.unidades_caja * 100) / 100 === a.precio_final_caja);
  }

  console.log('\n7) La planta se sigue validando');
  ok('planta ajena -> 403', (await get('/api/offers/articulos?seccion=U', t)).estado === 403);
  ok('sin planta -> 400', (await get('/api/offers/articulos', t)).estado === 400);

  await limpiar();
  await pool.end();
  console.log(fallos === 0 ? '\nTODO OK' : '\n' + fallos + ' FALLOS');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION: ' + e.stack); process.exit(1); });
