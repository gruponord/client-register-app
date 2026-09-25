// Fase 1: identidad del vendedor. Un vendedor normal tiene una planta; un
// gestor o jefe de ventas varias y entonces hay que preguntar.
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(APP, '.env') });
const jwt = require('jsonwebtoken');
const pool = require(path.join(APP, 'src/config/db.js'));

const BASE = 'http://127.0.0.1:3999';
let fallos = 0;
const comprobar = (t, cond, d) => {
  console.log((cond ? '  OK   ' : '  FALLO') + '  ' + t + (d ? '  -> ' + d : ''));
  if (!cond) fallos++;
};
const token = (id, role) => jwt.sign({ id, username: 'prueba', role }, process.env.JWT_SECRET, { expiresIn: '5m' });
const get = async (ruta, t) => {
  const r = await fetch(BASE + ruta, { headers: { Authorization: 'Bearer ' + t } });
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};

// Un vendedor del ERP tal y como lo dejaria el receptor.
const vendedor = (seccion, id, nombre, email) => [
  'GN', seccion, id, nombre, email, null, null, null, null, false, true,
  'K:' + seccion + ':' + id, 'h' + seccion + id,
];

(async () => {
  const limpiar = async () => {
    await pool.query("DELETE FROM erp.vendedores WHERE sync_hash LIKE 'h%'");
    await pool.query("DELETE FROM users WHERE username LIKE 'prueba_ofertas_%'");
    await pool.query("DELETE FROM plants WHERE code IN ('T','U','V')");
    await pool.query("DELETE FROM erp.secciones WHERE seccion_id IN ('T','U','V')");
  };
  await limpiar();

  // Plantas que faltan en la base local, para comprobar que se resuelve el nombre.
  await pool.query(`INSERT INTO plants (code, name, active, logo_path)
    VALUES ('T','Prueba T',true,'Z.jpg'), ('U','Prueba U',true,'Y.jpg'), ('V','Prueba V',true,'N.jpg')
    ON CONFLICT (code) DO UPDATE SET active = true`);
  // plantasTodas() cruza plants con erp.secciones: sin secciones no hay plantas
  // que ofrecer al usuario sin ficha de vendedor.
  for (const sec of ['T', 'U', 'V']) {
    await pool.query(
      `INSERT INTO erp.secciones (empresa_id, seccion_id, nombre, activo, sync_clave, sync_hash)
       VALUES ('GN', $1, $2, true, $3, 'PRUEBA_F1') ON CONFLICT DO NOTHING`,
      [sec, 'Seccion ' + sec, 'S:' + sec]);
  }

  const crearUsuario = async (sufijo, email, utilidades) => {
    const r = await pool.query(
      `INSERT INTO users (username, password_hash, email, full_name, role, active, utilities)
       VALUES ($1, 'x', $2, $3, 'comercial', true, $4) RETURNING id`,
      ['prueba_ofertas_' + sufijo, email, 'Prueba ' + sufijo, JSON.stringify(utilidades)]
    );
    return r.rows[0].id;
  };

  const COLS = `(empresa_id, seccion_id, vendedor_id, nombre, email, zona, vend_resp_id,
                 colaborador_id, movilidad_prev, baja, activoreal, sync_clave, sync_hash)`;
  const insVend = (v) => pool.query(
    `INSERT INTO erp.vendedores ${COLS} VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, v);

  console.log('\n1) Vendedor de una sola planta: entra directo');
  const u1 = await crearUsuario('uno', 'una.planta@zuvillaga.com', ['ofertas']);
  await insVend(vendedor('T', '901', 'VENDEDOR DE UNA PLANTA', 'una.planta@zuvillaga.com'));
  const r1 = await get('/api/offers/contexto', token(u1, 'comercial'));
  comprobar('200 y una planta', r1.estado === 200 && r1.cuerpo.plantas.length === 1, JSON.stringify(r1.cuerpo));
  comprobar('no pide seleccionar', r1.cuerpo.requiere_seleccion === false);
  comprobar('resuelve nombre de planta y logo',
    r1.cuerpo.plantas[0].planta_nombre === 'Prueba T' && r1.cuerpo.plantas[0].logo === '/logos/Z.jpg',
    JSON.stringify(r1.cuerpo.plantas[0]));
  comprobar('sin permiso de descuento', r1.cuerpo.puede_editar_dto === false);

  console.log('\n2) Gestor con dos plantas: hay que preguntar (el caso Benjami Puente)');
  const u2 = await crearUsuario('dos', 'gestor@mapsacomercial.com', ['ofertas', 'ofertas_dto']);
  await insVend(vendedor('V', '902', 'GESTOR NORD', 'gestor@mapsacomercial.com'));
  await insVend(vendedor('U', '903', 'GESTOR AYESTARAN', 'Gestor@MapsaComercial.com')); // ojo: otra caja
  const r2 = await get('/api/offers/contexto', token(u2, 'comercial'));
  comprobar('200 y dos plantas', r2.estado === 200 && r2.cuerpo.plantas.length === 2,
    JSON.stringify(r2.cuerpo.plantas && r2.cuerpo.plantas.map((p) => p.seccion_id)));
  comprobar('pide seleccionar', r2.cuerpo.requiere_seleccion === true);
  comprobar('empareja sin distinguir mayusculas',
    r2.cuerpo.plantas.some((p) => p.seccion_id === 'U'),
    JSON.stringify(r2.cuerpo.plantas.map((p) => p.seccion_id + '/' + p.vendedor_id)));
  comprobar('con permiso de descuento', r2.cuerpo.puede_editar_dto === true);

  console.log('\n3) Usuario SIN vendedor: elige entre todas las plantas');
  const u3 = await crearUsuario('huerfano', 'no.existe.en.erp@gruponord.com', ['ofertas']);
  const r3 = await get('/api/offers/contexto', token(u3, 'comercial'));
  comprobar('200, no 409', r3.estado === 200, 'HTTP ' + r3.estado);
  comprobar('marcado como no vinculado', r3.cuerpo.vinculado === false, JSON.stringify(r3.cuerpo.vinculado));
  // Se comprueba que ESTEN las tres, no que sean las unicas: la base de
  // desarrollo puede tener importada la muestra con las cuatro secciones reales.
  comprobar('le ofrece las tres secciones sembradas',
    ['T', 'U', 'V'].every((s) => r3.cuerpo.plantas.some((p) => p.seccion_id === s)),
    JSON.stringify(r3.cuerpo.plantas.map((p) => p.seccion_id)));
  comprobar('tiene que elegir', r3.cuerpo.requiere_seleccion === true);
  comprobar('sin vendedor asignado', r3.cuerpo.plantas.every((p) => p.vendedor_id === null),
    JSON.stringify(r3.cuerpo.plantas[0]));
  comprobar('y con su logotipo', r3.cuerpo.plantas.every((p) => p.logo && p.logo.startsWith('/logos/')));

  console.log('\n4) Sin la utilidad `ofertas`: 403');
  const u4 = await crearUsuario('sinutil', 'una.planta@zuvillaga.com', ['altas']);
  const r4 = await get('/api/offers/contexto', token(u4, 'comercial'));
  comprobar('403', r4.estado === 403, 'HTTP ' + r4.estado);

  console.log('\n5) Un vendedor de baja no cuenta como planta');
  const u5 = await crearUsuario('debaja', 'de.baja@zuvillaga.com', ['ofertas']);
  const vb = vendedor('T', '904', 'VENDEDOR DE BAJA', 'de.baja@zuvillaga.com');
  vb[9] = true;   // baja = true
  await insVend(vb);
  const r5 = await get('/api/offers/contexto', token(u5, 'comercial'));
  comprobar('no vincula: cae al respaldo de todas las plantas',
    r5.estado === 200 && r5.cuerpo.vinculado === false, 'HTTP ' + r5.estado);

  console.log('\n6) El admin puede editar el descuento sin la utilidad');
  const r6 = await get('/api/offers/contexto', token(u1, 'admin'));
  comprobar('puede_editar_dto para admin', r6.cuerpo.puede_editar_dto === true);

  console.log('\n7) El vinculado sigue viendo SOLO sus plantas');
  const r7 = await get('/api/offers/contexto', token(u1, 'comercial'));
  comprobar('una sola planta, la suya', r7.cuerpo.plantas.length === 1 && r7.cuerpo.vinculado === true,
    JSON.stringify(r7.cuerpo.plantas.map((p) => p.seccion_id)) + ' vinculado=' + r7.cuerpo.vinculado);

  console.log('\n8) El logotipo se sirve por HTTP');
  const l = await fetch(BASE + '/logos/Z.jpg');
  comprobar('GET /logos/Z.jpg', l.status === 200 && (l.headers.get('content-type') || '').includes('image'),
    'HTTP ' + l.status + ' ' + l.headers.get('content-type'));

  await limpiar();
  await pool.end();
  console.log(fallos === 0 ? '\nTODO OK' : '\n' + fallos + ' FALLOS');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION: ' + e.stack); process.exit(1); });
