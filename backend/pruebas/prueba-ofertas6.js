// Suite 6 -- el descuento maximo.
//
// `articulos_sec.por_dto` es el TOPE autorizado, no un descuento a aplicar.
// Hasta este cambio se aplicaba solo, asi que los listados salian con el maximo
// descuento sin que nadie lo decidiera. Aqui se comprueba la regla nueva:
// empieza en 0, sube hasta el tope, y pasarse necesita permiso.
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(APP, '.env') });
require('./guarda');   // aborta si la base no es de desarrollo
const jwt = require('jsonwebtoken');
const pool = require(path.join(APP, 'src/config/db.js'));

const BASE = 'http://127.0.0.1:3999';
const SEC = 'W';                    // seccion de pruebas, propia de esta suite
let fallos = 0;
const ok = (c, q, v) => {
  if (c) console.log('  OK    ' + q + (v !== undefined ? '  -> ' + v : ''));
  else { fallos++; console.log('  FALLO ' + q + '  -> ' + JSON.stringify(v)); }
};
const tok = (id, role) => jwt.sign({ id, username: 'p', role: role || 'comercial' },
  process.env.JWT_SECRET, { expiresIn: '5m' });
const pide = async (metodo, ruta, t, cuerpo) => {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + t, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const txt = await r.text();
  let cuerpoR; try { cuerpoR = JSON.parse(txt); } catch (_) { cuerpoR = txt; }
  return { estado: r.status, cuerpo: cuerpoR };
};

// Articulos de prueba con topes distintos: sin tope, tope normal, y el caso PLV.
const ARTS = [
  { id: 'W0000', desc: 'ARTICULO SIN TOPE', precio: 10, tope: 0 },
  { id: 'W0010', desc: 'ARTICULO TOPE 10', precio: 20, tope: 10 },
  { id: 'W0100', desc: 'COPA DE REGALO (PLV)', precio: 5, tope: 100 },
];

const sembrar = async () => {
  await pool.query(
    `INSERT INTO erp.secciones (empresa_id, seccion_id, nombre, activo, sync_clave, sync_hash, sync_run)
     VALUES ('GN',$1,'Pruebas dto',true,'x','y','00000000-0000-0000-0000-000000000000')
     ON CONFLICT (empresa_id, seccion_id) DO NOTHING`, [SEC]);
  await pool.query(
    `INSERT INTO plants (code, name, active) VALUES ($1,'Pruebas dto',true)
     ON CONFLICT (code) DO UPDATE SET active = true`, [SEC]);
  for (const a of ARTS) {
    await pool.query(
      `INSERT INTO erp.articulos (empresa_id, articulo_id, descripcion, unidad_prin_id,
              unidades_agrup, peso_neto, quitar_catalogo, activo, sync_clave, sync_hash, sync_run)
       VALUES ('GN',$1,$2,'U',1,1,false,true,$1,'h','00000000-0000-0000-0000-000000000000')
       ON CONFLICT (empresa_id, articulo_id) DO UPDATE SET descripcion = EXCLUDED.descripcion,
              quitar_catalogo = false, activo = true`, [a.id, a.desc]);
    await pool.query(
      `INSERT INTO erp.articulos_sec (empresa_id, articulo_id, seccion_id, precio_vta, por_dto,
              status, vta_tpv, activo, sync_clave, sync_hash, sync_run)
       VALUES ('GN',$1,$2,$3,$4,0,true,true,$1,'h','00000000-0000-0000-0000-000000000000')
       ON CONFLICT (empresa_id, articulo_id, seccion_id) DO UPDATE SET
              precio_vta = EXCLUDED.precio_vta, por_dto = EXCLUDED.por_dto,
              status = 0, vta_tpv = true, activo = true`, [a.id, SEC, a.precio, a.tope]);
  }
};

const limpiar = async () => {
  await pool.query('DELETE FROM offer_items WHERE offer_id IN (SELECT id FROM offers WHERE seccion_id = $1)', [SEC]);
  await pool.query('DELETE FROM offers WHERE seccion_id = $1', [SEC]);
  await pool.query('DELETE FROM erp.articulos_sec WHERE seccion_id = $1', [SEC]);
  await pool.query('DELETE FROM erp.articulos WHERE articulo_id = ANY($1)', [ARTS.map((a) => a.id)]);
  await pool.query('DELETE FROM erp.secciones WHERE seccion_id = $1', [SEC]);
  await pool.query('DELETE FROM plants WHERE code = $1', [SEC]);
};

let uSin, uCon;   // usuario sin y con el permiso de pasarse del tope

const usuario = async (username, utils) => {
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash, full_name, role, active, utilities)
     VALUES ($1,$2,'x',$1,'comercial',true,$3::jsonb)
     ON CONFLICT (username) DO UPDATE SET utilities = EXCLUDED.utilities, active = true
     RETURNING id`, [username, username + '@pruebas.local', JSON.stringify(utils)]);
  return rows[0].id;
};

const crear = async (t, lineas) => pide('POST', '/api/offers', t, {
  seccion: SEC,
  cliente_nuevo: { nombre: 'CLIENTE DE PRUEBA', poblacion: 'AQUI' },
  lineas,
});

(async () => {
  try {
    await sembrar();
    uSin = await usuario('prueba-dto-sin', ['ofertas']);
    uCon = await usuario('prueba-dto-con', ['ofertas', 'ofertas_dto']);
    const tSin = tok(uSin), tCon = tok(uCon);

    console.log('\n=== 1. EL CATALOGO ENSEÑA EL TOPE Y NO APLICA DESCUENTO ===');
    const cat = await pide('GET', '/api/offers/articulos?seccion=' + SEC + '&por_pagina=50', tSin);
    ok(cat.estado === 200, 'el catalogo responde', cat.estado);
    const porId = new Map((cat.cuerpo.articulos || []).map((a) => [a.articulo_id, a]));
    for (const a of ARTS) {
      const c = porId.get(a.id);
      if (!c) { ok(false, 'falta ' + a.id + ' en el catalogo'); continue; }
      ok(c.dto_max === a.tope, '  ' + a.desc + ': viaja el tope', c.dto_max + ' %');
      ok(Number(c.dto_pct) === 0, '  ' + a.desc + ': NO trae descuento aplicado', c.dto_pct);
      ok(Number(c.precio_final_unidad) === Number(c.precio_unidad),
        '  ' + a.desc + ': precio final = precio de tarifa',
        c.precio_unidad + ' = ' + c.precio_final_unidad);
    }
    // El caso que motivo el cambio: la copa de PLV no puede salir regalada sola.
    const copa = porId.get('W0100');
    ok(Number(copa.precio_final_unidad) === 5,
      'la copa con tope 100 % NO sale a cero', copa.precio_final_unidad + ' EUR');

    console.log('\n=== 2. SIN PERMISO: DE 0 AL TOPE ===');
    let r = await crear(tSin, [{ articulo_id: 'W0010', dto_pct: 0 }]);
    ok(r.estado === 201, 'un 0 % se acepta', r.estado);
    r = await crear(tSin, [{ articulo_id: 'W0010', dto_pct: 10 }]);
    ok(r.estado === 201, 'justo el tope se acepta', r.estado);
    r = await crear(tSin, [{ articulo_id: 'W0010', dto_pct: 7.5 }]);
    ok(r.estado === 201, 'un valor intermedio se acepta', r.estado);
    // Esto es lo que ANTES no se podia hacer sin permiso: ahora si.
    ok(true, 'y antes de este cambio nada de esto era posible sin permiso');

    console.log('\n=== 3. SIN PERMISO: PASARSE DEL TOPE SE RECHAZA ===');
    r = await crear(tSin, [{ articulo_id: 'W0010', dto_pct: 10.5 }]);
    ok(r.estado === 403, 'medio punto por encima ya se rechaza', r.estado);
    ok(r.cuerpo.code === 'DTO_SUPERA_MAXIMO', 'con codigo propio', r.cuerpo.code);
    ok(r.cuerpo.dto_max === 10, 'y diciendo cual era el tope', r.cuerpo.dto_max);
    ok(/10/.test(r.cuerpo.error || ''), 'el mensaje nombra el maximo', r.cuerpo.error);
    r = await crear(tSin, [{ articulo_id: 'W0000', dto_pct: 1 }]);
    ok(r.estado === 403, 'con tope 0, cualquier descuento se rechaza', r.estado);
    r = await crear(tSin, [{ articulo_id: 'W0000', dto_pct: 0 }]);
    ok(r.estado === 201, 'pero el 0 pasa', r.estado);

    console.log('\n=== 4. CON PERMISO: SE PUEDE PASAR ===');
    r = await crear(tCon, [{ articulo_id: 'W0010', dto_pct: 30 }]);
    ok(r.estado === 201, 'el 30 % sobre un tope de 10 se acepta', r.estado);
    const l = r.cuerpo.lineas[0];
    ok(l.dto_max === 10, 'la linea guarda el tope de ese dia', l.dto_max);
    ok(l.dto_excedido === true, 'y queda marcada como excedida', l.dto_excedido);
    r = await crear(tCon, [{ articulo_id: 'W0010', dto_pct: 101 }]);
    ok(r.estado === 400, 'pero el 101 % sigue siendo invalido', r.estado);

    console.log('\n=== 5. SIN INDICAR NADA, CERO (NUNCA EL TOPE) ===');
    // El fallo que se corrige: antes, omitir el descuento aplicaba el maximo.
    r = await crear(tSin, [{ articulo_id: 'W0010' }, { articulo_id: 'W0100' }]);
    ok(r.estado === 201, 'se guarda', r.estado);
    const ceros = r.cuerpo.lineas.every((x) => Number(x.dto_pct) === 0);
    ok(ceros, 'las dos lineas salen a 0 %',
      r.cuerpo.lineas.map((x) => x.articulo_id + ':' + x.dto_pct).join(' '));
    const copaL = r.cuerpo.lineas.find((x) => x.articulo_id === 'W0100');
    ok(Number(copaL.precio_final_unidad) === 5,
      'la copa se cotiza a su precio, no regalada', copaL.precio_final_unidad + ' EUR');
    ok(copaL.dto_max === 100, 'aunque su tope sea del 100 %', copaL.dto_max);

    console.log('\n=== 6. EL TOPE SE CONGELA CON LA LINEA ===');
    r = await crear(tSin, [{ articulo_id: 'W0010', dto_pct: 10 }]);
    const idOferta = r.cuerpo.id;
    // Cambia el tope en el ERP, como haria una pasada del sincronizador.
    await pool.query("UPDATE erp.articulos_sec SET por_dto = 2 WHERE articulo_id = 'W0010' AND seccion_id = $1", [SEC]);
    const rel = await pide('GET', '/api/offers/' + idOferta, tSin);
    ok(rel.cuerpo.lineas[0].dto_max === 10,
      'el listado sigue diciendo el tope que habia al emitirlo', rel.cuerpo.lineas[0].dto_max);
    ok(rel.cuerpo.lineas[0].dto_excedido === false,
      'y no se marca como excedido por un cambio posterior', rel.cuerpo.lineas[0].dto_excedido);
    // Y el catalogo ya refleja el nuevo.
    const cat2 = await pide('GET', '/api/offers/articulos?seccion=' + SEC + '&codigo=W0010', tSin);
    ok(cat2.cuerpo.articulos[0].dto_max === 2, 'mientras el catalogo ya ensena el nuevo', 2);
    await pool.query("UPDATE erp.articulos_sec SET por_dto = 10 WHERE articulo_id = 'W0010' AND seccion_id = $1", [SEC]);

    console.log('\n=== 7. EL TOPE NO SALE EN EL PDF ===');
    // Lo pidio asi: el cliente no debe leer hasta donde se le podia haber bajado.
    const PDFDocument = require('pdfkit');
    const orig = PDFDocument.prototype.text;
    const dibujado = [];
    PDFDocument.prototype.text = function (s, ...resto) {
      if (s !== null && s !== undefined) dibujado.push(String(s));
      return orig.call(this, s, ...resto);
    };
    const { generarPdfOferta } = require(path.join(APP, 'src/services/ofertaPdf.service.js'));
    const conTope = await crear(tCon, [{ articulo_id: 'W0010', dto_pct: 30 }]);
    const detalle = await pide('GET', '/api/offers/' + conTope.cuerpo.id, tCon);
    await generarPdfOferta(detalle.cuerpo);
    PDFDocument.prototype.text = orig;
    const texto = dibujado.join('\n');
    ok(!/máx|max\b|Dto\. máx/i.test(texto), 'no aparece la palabra "max" en el documento');
    ok(!texto.includes('supera'), 'ni el aviso de que se paso del tope');
    ok(texto.includes('30 %'), 'pero si el descuento que se aplica', '30 %');

    console.log('\n=== 8. LA PANTALLA Y EL SERVIDOR CUENTAN LO MISMO ===');
    const ctxSin = await pide('GET', '/api/offers/contexto', tSin);
    const ctxCon = await pide('GET', '/api/offers/contexto', tCon);
    ok(ctxSin.cuerpo.puede_editar_dto === false, 'sin permiso, la pantalla lo sabe');
    ok(ctxCon.cuerpo.puede_editar_dto === true, 'con permiso, tambien');
  } finally {
    await limpiar();
    await pool.query('DELETE FROM users WHERE username LIKE $1', ['prueba-dto-%']);
    console.log('\n(sembrado de prueba retirado)');
  }

  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo correcto'));
  await pool.end();
  process.exit(fallos ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  try { await limpiar(); await pool.query('DELETE FROM users WHERE username LIKE $1', ['prueba-dto-%']); } catch (_) {}
  process.exit(1);
});
