// Fase 4: guardado, congelacion de precios, permisos del descuento y PDF.
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(APP, '.env') });
const jwt = require('jsonwebtoken');
const pool = require(path.join(APP, 'src/config/db.js'));

const BASE = 'http://127.0.0.1:3999';
let fallos = 0;
const ok = (t, c, d) => { console.log((c ? '  OK   ' : '  FALLO') + '  ' + t + (d ? '  -> ' + d : '')); if (!c) fallos++; };
const tok = (id, role) => jwt.sign({ id, username: 'p', role: role || 'comercial' }, process.env.JWT_SECRET, { expiresIn: '5m' });
const pide = async (metodo, ruta, t, cuerpo) => {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + t, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const tipo = r.headers.get('content-type') || '';
  return {
    estado: r.status,
    tipo,
    cuerpo: tipo.includes('json') ? await r.json().catch(() => null) : null,
    bytes: tipo.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : null,
  };
};
const M = 'PRUEBA_F4';

(async () => {
  const limpiar = async () => {
    await pool.query("DELETE FROM offers WHERE cliente_nombre LIKE 'F4 %' OR cliente_nombre LIKE '%PRUEBA F4%'");
    for (const t of ['articulos', 'articulos_sec', 'familias', 'proveedores',
      'vendedores', 'clientes', 'cli_env', 'cltes_rutas_vta', 'rutas_venta']) {
      await pool.query(`DELETE FROM erp.${t} WHERE sync_hash = $1`, [M]);
    }
    await pool.query("DELETE FROM users WHERE username LIKE 'p_f4_%'");
  };
  await limpiar();

  const ins = (tabla, cols, vals) => pool.query(
    `INSERT INTO erp.${tabla} (${cols.join(',')}, activo, sync_clave, sync_hash)
     VALUES (${vals.map((_, i) => '$' + (i + 1)).join(',')}, true, $${vals.length + 1}, $${vals.length + 2})`,
    [...vals, tabla + ':' + vals.join(':'), M]);

  // La seccion y la planta tienen que existir: el usuario SIN ficha de vendedor
  // elige entre las plantas que resultan de cruzar `plants` con `erp.secciones`,
  // y las suites de sincronizacion hacen TRUNCATE de esa tabla. Sin esto, esta
  // suite pasa o falla segun lo que se haya ejecutado antes.
  await pool.query(
    `INSERT INTO erp.secciones (empresa_id, seccion_id, nombre, activo, sync_clave, sync_hash)
     VALUES ('GN', 'Z', 'Comercial Zubillaga', true, 'S:Z', $1) ON CONFLICT DO NOTHING`, [M]);
  await pool.query(
    `INSERT INTO plants (code, name, active, logo_path)
     VALUES ('Z', 'Zubillaga', true, 'Z.jpg')
     ON CONFLICT (code) DO UPDATE SET active = true`);

  // Cadena minima en Z, y un cliente en Y para probar el aislamiento.
  await ins('vendedores', ['empresa_id', 'seccion_id', 'vendedor_id', 'nombre', 'email', 'baja', 'activoreal'],
    ['GN', 'Z', '601', 'DIEGO DE PRUEBA', 'diego.f4@zuvillaga.com', false, true]);
  await ins('rutas_venta', ['empresa_id', 'seccion_id', 'ruta_ventas_id', 'vendedor_id'], ['GN', 'Z', 'RA', '601']);
  const cliente = async (id, nombre, pobl, sec) => {
    await ins('clientes', ['empresa_id', 'cliente_id', 'nombre', 'poblacion', 'secpref_id', 'estado'],
      ['GN', id, nombre, pobl, sec, false]);
    await ins('cli_env', ['empresa_id', 'cliente_id', 'local_id', 'nombre'], ['GN', id, '0', nombre]);
    await ins('cltes_rutas_vta', ['empresa_id', 'cliente_id', 'local_id', 'origen_id', 'ruta_venta_id', 'period_semana'],
      ['GN', id, '0', '0', 'RA', '1']);
  };
  await cliente('F4C1', 'F4 BAR DEL PUERTO', 'GETXO', 'Z');

  await ins('articulos', ['empresa_id', 'articulo_id', 'descripcion', 'unidad_prin_id', 'peso_neto', 'unidades_agrup'],
    ['GN', 'F4A1', 'F4 LATA CERVEZA 0,33L', 'U', null, 24]);
  await ins('articulos_sec', ['empresa_id', 'articulo_id', 'seccion_id', 'precio_vta', 'por_dto', 'status', 'vta_tpv'],
    ['GN', 'F4A1', 'Z', 1.00, 0, 0, true]);
  await ins('articulos', ['empresa_id', 'articulo_id', 'descripcion', 'unidad_prin_id', 'peso_neto', 'unidades_agrup'],
    ['GN', 'F4A2', 'F4 JAMON 5,5K', 'K', 5.5, 2]);
  await ins('articulos_sec', ['empresa_id', 'articulo_id', 'seccion_id', 'precio_vta', 'por_dto', 'status', 'vta_tpv'],
    ['GN', 'F4A2', 'Z', 26.95, 10, 0, true]);

  const usuario = async (suf, email, utils) => (await pool.query(
    `INSERT INTO users (username,password_hash,email,full_name,role,active,utilities)
     VALUES ($1,'x',$2,$3,'comercial',true,$4) RETURNING id`,
    ['p_f4_' + suf, email, 'F4 ' + suf, JSON.stringify(utils)])).rows[0].id;

  const u1 = await usuario('base', 'diego.f4@zuvillaga.com', ['ofertas']);
  const uDto = await usuario('condto', 'diego.f4@zuvillaga.com', ['ofertas', 'ofertas_dto']);
  const uOtro = await usuario('otro', 'diego.f4@zuvillaga.com', ['ofertas']);
  const t1 = tok(u1); const tDto = tok(uDto); const tOtro = tok(uOtro);

  console.log('\n1) Guardar una oferta');
  const r1 = await pide('POST', '/api/offers', t1, {
    seccion: 'Z',
    cliente: { cliente_id: 'F4C1', local_id: '0' },
    lineas: [{ articulo_id: 'F4A1' }, { articulo_id: 'F4A2' }],
  });
  ok('201', r1.estado === 201, 'HTTP ' + r1.estado + ' ' + JSON.stringify(r1.cuerpo?.error || ''));
  const of = r1.cuerpo;
  ok('con sus dos lineas', of.lineas.length === 2);
  ok('cliente resuelto del ERP', of.cliente_nombre === 'F4 BAR DEL PUERTO' && of.cliente_poblacion === 'GETXO',
    of.cliente_nombre + ' / ' + of.cliente_poblacion);
  ok('vendedor de la ruta', of.vendedor_nombre === 'DIEGO DE PRUEBA', String(of.vendedor_nombre));
  ok('no marcado como nuevo', of.es_nuevo === false);
  ok('trae la fecha de los precios', 'precios_de' in of);

  const lata = of.lineas.find((l) => l.articulo_id === 'F4A1');
  const jam = of.lineas.find((l) => l.articulo_id === 'F4A2');
  ok('lata: 1,00 sin dto, caja 24,00', lata.precio_final_unidad === 1 && lata.precio_final_caja === 24,
    lata.precio_final_unidad + ' / ' + lata.precio_final_caja);
  // El 10 % del ERP es el TOPE, no un descuento aplicado: al guardar sin pedir
  // descuento, la linea sale a precio integro y el tope queda anotado.
  ok('jamon: 148,23 y SIN descuento aplicado',
    jam.precio_unidad === 148.23 && jam.dto_pct === 0 && jam.precio_final_unidad === 148.23,
    JSON.stringify([jam.precio_unidad, jam.dto_pct, jam.precio_final_unidad]));
  ok('jamon: el tope del 10% queda congelado en la linea', jam.dto_max === 10, String(jam.dto_max));
  ok('jamon: y no consta como excedido', jam.dto_excedido === false, String(jam.dto_excedido));
  ok('jamon: caja de 2 -> 296,46', jam.precio_final_caja === 296.46, String(jam.precio_final_caja));
  ok('el aviso de kilos se conserva', jam.es_kilo === true && Number(jam.peso_neto) === 5.5);
  ok('y el precio por kilo, que ahora sale impreso', jam.precio_kilo === 26.95, String(jam.precio_kilo));
  ok('con su final por kilo = tarifa', jam.precio_final_kilo === 26.95, String(jam.precio_final_kilo));

  console.log('\n1b) La cabecera: nombre solo si hay ficha de vendedor');
  ok('vinculado: nombre del vendedor', of.vendedor_nombre === 'DIEGO DE PRUEBA', String(of.vendedor_nombre));
  ok('vinculado: correo de quien lo hace',
    of.emisor_email === 'diego.f4@zuvillaga.com', String(of.emisor_email));

  // Un usuario cuyo correo no cuadra con ningun vendedor: emite igual, pero el
  // documento sale sin nombre. Y NO debe heredar el vendedor de la ruta del
  // cliente, que seria decir que el listado lo hizo alguien que no lo hizo.
  const uLibre = await usuario('libre', 'nadie.f4@gruponord.com', ['ofertas']);
  const sinFicha = await pide('POST', '/api/offers', tok(uLibre), {
    seccion: 'Z', cliente: { cliente_id: 'F4C1', local_id: '0' },
    lineas: [{ articulo_id: 'F4A1' }],
  });
  ok('sin ficha: 201 igual', sinFicha.estado === 201, 'HTTP ' + sinFicha.estado);
  ok('sin ficha: SIN nombre', sinFicha.cuerpo.vendedor_nombre === null,
    JSON.stringify(sinFicha.cuerpo.vendedor_nombre));
  ok('sin ficha: no hereda el vendedor de la ruta',
    sinFicha.cuerpo.vendedor_id === null, JSON.stringify(sinFicha.cuerpo.vendedor_id));
  ok('sin ficha: su propio correo',
    sinFicha.cuerpo.emisor_email === 'nadie.f4@gruponord.com', String(sinFicha.cuerpo.emisor_email));

  console.log('\n2) El precio NO se acepta del cliente');
  const r2 = await pide('POST', '/api/offers', t1, {
    seccion: 'Z',
    cliente: { cliente_id: 'F4C1', local_id: '0' },
    lineas: [{ articulo_id: 'F4A1', precio_unidad: 0.01, precio_final_unidad: 0.01, precio_vta: 0.01 }],
  });
  ok('se ignora el precio enviado y se usa el del ERP',
    r2.cuerpo.lineas[0].precio_final_unidad === 1, String(r2.cuerpo.lineas[0].precio_final_unidad));

  console.log('\n3) Permiso del descuento');
  const sinP = await pide('POST', '/api/offers', t1, {
    seccion: 'Z', cliente: { cliente_id: 'F4C1', local_id: '0' },
    lineas: [{ articulo_id: 'F4A1', dto_pct: 25 }],
  });
  // F4A1 no tiene tope, asi que un 25 % se pasa y hace falta permiso.
  ok('sin permiso, pasarse del tope -> 403',
    sinP.estado === 403 && sinP.cuerpo.code === 'DTO_SUPERA_MAXIMO', 'HTTP ' + sinP.estado);
  const igual = await pide('POST', '/api/offers', t1, {
    seccion: 'Z', cliente: { cliente_id: 'F4C1', local_id: '0' },
    lineas: [{ articulo_id: 'F4A2', dto_pct: 10 }],
  });
  ok('pero llegar justo al tope se permite SIN permiso', igual.estado === 201, 'HTTP ' + igual.estado);
  ok('y queda marcado como decidido por el comercial',
    igual.cuerpo.lineas[0].dto_editado === true, String(igual.cuerpo.lineas[0].dto_editado));
  ok('sin constar como excedido', igual.cuerpo.lineas[0].dto_excedido === false);

  const conP = await pide('POST', '/api/offers', tDto, {
    seccion: 'Z', cliente: { cliente_id: 'F4C1', local_id: '0' },
    lineas: [{ articulo_id: 'F4A1', dto_pct: 25 }],
  });
  ok('con permiso -> 201 y 0,75', conP.estado === 201 && conP.cuerpo.lineas[0].precio_final_unidad === 0.75,
    'HTTP ' + conP.estado + ' ' + conP.cuerpo?.lineas?.[0]?.precio_final_unidad);
  ok('marcado como editado, para poder auditarlo', conP.cuerpo.lineas[0].dto_editado === true);
  const malo = await pide('POST', '/api/offers', tDto, {
    seccion: 'Z', cliente: { cliente_id: 'F4C1', local_id: '0' },
    lineas: [{ articulo_id: 'F4A1', dto_pct: 150 }],
  });
  ok('un dto de 150% -> 400', malo.estado === 400);

  console.log('\n4) Validaciones');
  ok('sin lineas -> 400', (await pide('POST', '/api/offers', t1,
    { seccion: 'Z', cliente: { cliente_id: 'F4C1', local_id: '0' }, lineas: [] })).estado === 400);
  ok('sin cliente -> 400', (await pide('POST', '/api/offers', t1,
    { seccion: 'Z', lineas: [{ articulo_id: 'F4A1' }] })).estado === 400);
  const noHay = await pide('POST', '/api/offers', t1, {
    seccion: 'Z', cliente: { cliente_id: 'F4C1', local_id: '0' },
    lineas: [{ articulo_id: 'F4A1' }, { articulo_id: 'NO_EXISTE' }],
  });
  ok('articulo inexistente -> 400 diciendo cual',
    noHay.estado === 400 && noHay.cuerpo.articulos.includes('NO_EXISTE'), JSON.stringify(noHay.cuerpo));
  const otroCli = await pide('POST', '/api/offers', t1, {
    seccion: 'Z', cliente: { cliente_id: 'NO_MIO', local_id: '0' },
    lineas: [{ articulo_id: 'F4A1' }],
  });
  ok('cliente que no es de la planta -> 400',
    otroCli.estado === 400 && otroCli.cuerpo.code === 'CLIENTE_NO_VALIDO');

  console.log('\n5) Cliente nuevo');
  const nuevo = await pide('POST', '/api/offers', t1, {
    seccion: 'Z',
    cliente_nuevo: { nombre: '  F4 TABERNA RECIEN ABIERTA  ', poblacion: 'PORTUGALETE' },
    lineas: [{ articulo_id: 'F4A1' }],
  });
  ok('201 y marcado como nuevo', nuevo.estado === 201 && nuevo.cuerpo.es_nuevo === true, 'HTTP ' + nuevo.estado);
  ok('sin codigo de cliente', nuevo.cuerpo.cliente_id === null);
  ok('nombre recortado', nuevo.cuerpo.cliente_nombre === 'F4 TABERNA RECIEN ABIERTA',
    JSON.stringify(nuevo.cuerpo.cliente_nombre));
  ok('nuevo sin nombre -> 400', (await pide('POST', '/api/offers', t1,
    { seccion: 'Z', cliente_nuevo: { poblacion: 'X' }, lineas: [{ articulo_id: 'F4A1' }] })).estado === 400);

  console.log('\n6) LOS PRECIOS QUEDAN CONGELADOS');
  await pool.query("UPDATE erp.articulos_sec SET precio_vta = 99.99 WHERE articulo_id = 'F4A1' AND seccion_id = 'Z'");
  const relee = await pide('GET', '/api/offers/' + of.id, t1);
  ok('la oferta guardada sigue a 1,00 aunque el ERP diga 99,99',
    relee.cuerpo.lineas.find((l) => l.articulo_id === 'F4A1').precio_final_unidad === 1,
    String(relee.cuerpo.lineas.find((l) => l.articulo_id === 'F4A1').precio_final_unidad));
  const catalogo = await pide('GET', '/api/offers/articulos?seccion=Z&codigo=F4A1', t1);
  ok('y el catalogo si refleja el precio nuevo',
    catalogo.cuerpo.articulos[0].precio_unidad === 99.99,
    String(catalogo.cuerpo.articulos[0].precio_unidad));
  await pool.query("UPDATE erp.articulos_sec SET precio_vta = 1.00 WHERE articulo_id = 'F4A1' AND seccion_id = 'Z'");

  console.log('\n7) Al releer, las seis cifras salen identicas');
  const relee2 = await pide('GET', '/api/offers/' + of.id, t1);
  const jam2 = relee2.cuerpo.lineas.find((l) => l.articulo_id === 'F4A2');
  ok('el precio por kilo se recupera exacto, sin dividir', jam2.precio_kilo === 26.95, String(jam2.precio_kilo));
  ok('unidad 148,23 (ni 815,27 por multiplicar dos veces)', jam2.precio_unidad === 148.23, String(jam2.precio_unidad));
  ok('caja 296,46', jam2.precio_caja === 296.46, String(jam2.precio_caja));
  // La oferta se guardo sin descuento (el 10 % del ERP es el tope, no una
  // tarifa aplicada), asi que los finales coinciden con los de tarifa. Lo que
  // importa aqui sigue siendo que se REPRODUCEN exactos al releer.
  ok('final unidad 148,23', jam2.precio_final_unidad === 148.23, String(jam2.precio_final_unidad));
  ok('final caja 296,46', jam2.precio_final_caja === 296.46, String(jam2.precio_final_caja));
  ok('final kilo 26,95', jam2.precio_final_kilo === 26.95, String(jam2.precio_final_kilo));
  ok('y el tope del dia sigue anotado', jam2.dto_max === 10, String(jam2.dto_max));
  const lata2 = relee2.cuerpo.lineas.find((l) => l.articulo_id === 'F4A1');
  ok('y la lata sigue sin precio por kilo', lata2.precio_kilo === null, String(lata2.precio_kilo));

  console.log('\n8) Cada uno ve sus ofertas');
  ok('otro comercial -> 403', (await pide('GET', '/api/offers/' + of.id, tOtro)).estado === 403);
  ok('un admin -> 200', (await pide('GET', '/api/offers/' + of.id, tok(uOtro, 'admin'))).estado === 200);
  ok('oferta inexistente -> 404', (await pide('GET', '/api/offers/999999', t1)).estado === 404);

  console.log('\n9) El PDF');
  const pdf = await pide('GET', '/api/offers/' + of.id + '/pdf', t1);
  ok('200 y content-type de PDF', pdf.estado === 200 && pdf.tipo.includes('application/pdf'), pdf.tipo);
  ok('empieza por %PDF', pdf.bytes && pdf.bytes.slice(0, 4).toString() === '%PDF',
    pdf.bytes && pdf.bytes.slice(0, 8).toString());
  ok('y pesa algo razonable', pdf.bytes.length > 3000 && pdf.bytes.length < 300000,
    Math.round(pdf.bytes.length / 1024) + ' KB');
  const texto = pdf.bytes.toString('latin1');
  ok('lleva el logotipo de la planta embebido', texto.includes('DCTDecode') || texto.includes('Image'),
    'imagen: ' + (texto.includes('DCTDecode') ? 'JPEG' : 'otra'));
  // El PDF va comprimido, asi que no se puede buscar el texto tal cual: se
  // comprueba que el contenido este comprimido y que el documento tenga una
  // sola pagina, que es lo que corresponde a dos articulos.
  ok('contenido comprimido', texto.includes('FlateDecode'));
  ok('una sola pagina', (texto.match(/\/Type\s*\/Page[^s]/g) || []).length === 1,
    String((texto.match(/\/Type\s*\/Page[^s]/g) || []).length));
  ok('PDF de otro -> 403', (await pide('GET', '/api/offers/' + of.id + '/pdf', tOtro)).estado === 403);

  console.log('\n10) Enviar por correo: validacion');
  ok('correo invalido -> 400',
    (await pide('POST', '/api/offers/' + of.id + '/enviar', t1, { email: 'no-es-un-correo' })).estado === 400);
  ok('sin correo -> 400',
    (await pide('POST', '/api/offers/' + of.id + '/enviar', t1, {})).estado === 400);

  await limpiar();
  await pool.end();
  console.log(fallos === 0 ? '\nTODO OK' : '\n' + fallos + ' FALLOS');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION: ' + e.stack); process.exit(1); });
