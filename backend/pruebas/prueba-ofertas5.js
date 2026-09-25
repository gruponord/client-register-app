// Suite 5 -- el impreso bilingue.
//
// No mira el PDF por fuera: envuelve `PDFDocument.prototype.text` y se queda con
// TODAS las cadenas que se dibujan. Asi se puede afirmar lo que de verdad
// importa, que es que en un documento en catalan no se cuele ni una etiqueta en
// castellano, y que los datos del ERP salgan sin tocar.
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(APP, '.env') });
require('./guarda');   // aborta si la base no es de desarrollo

const PDFDocument = require('pdfkit');
const fs = require('fs');
const pool = require(path.join(APP, 'src/config/db.js'));
const { generarPdfOferta, TEXTOS, textosDe, COLS } =
  require(path.join(APP, 'src/services/ofertaPdf.service.js'));
const { calcularLinea } = require(path.join(APP, 'src/services/precios.service.js'));
const servicio = require(path.join(APP, 'src/services/offers.service.js'));

let fallos = 0;
const ok = (c, q, v) => {
  if (c) console.log('  OK    ' + q + (v !== undefined ? '  -> ' + v : ''));
  else { fallos++; console.log('  FALLO ' + q + '  -> ' + JSON.stringify(v)); }
};

// Recoge lo que se dibuja, sin tocar el servicio.
const textoOriginal = PDFDocument.prototype.text;
let recogido = null;
PDFDocument.prototype.text = function (s, ...resto) {
  if (recogido && s !== null && s !== undefined) recogido.push(String(s));
  return textoOriginal.call(this, s, ...resto);
};
const dibujado = async (o) => {
  recogido = [];
  const buf = await generarPdfOferta(o);
  const lineas = recogido; recogido = null;
  return { buf, lineas, texto: lineas.join('\n') };
};

// Una linea con la forma EXACTA que monta el controlador: el articulo por un
// lado y los importes calculados por otro.
const linea = (a, dto) => ({
  articulo_id: a.articulo_id,
  descripcion: a.descripcion,
  unidad: a.unidad,
  ...calcularLinea({
    unidad: a.unidad, precio_vta: a.precio_vta, peso_neto: a.peso_neto,
    unidades_caja: a.unidades_caja, dto_pct: dto || 0,
  }),
});

// Un listado de mentira pero con la forma que monta el controlador.
const listado = (seccion, extra = {}) => ({
  id: 4321,
  created_at: '2026-08-26T09:15:00Z',
  seccion_id: seccion,
  cliente_id: '304857',
  cliente_nombre: 'BAR RESTAURANT CAN PUJOL',
  cliente_poblacion: 'LA SEU D\'URGELL',
  es_nuevo: false,
  vendedor_nombre: 'SERGI PARRAMON',
  emisor_email: 'sergi.parramon@nordpirineus.com',
  logo_path: seccion + '.jpg',
  precios_de: '2026-08-24T04:00:00Z',
  lineas: [
    // Por unidades con caja de 24: precio de unidad y de caja.
    linea({ articulo_id: '110024', descripcion: 'CERVESA ESTRELLA DAMM 1/5 CAIXA 24 UT',
      unidad: 'U', precio_vta: 0.62, unidades_caja: 24, peso_neto: 0.2 }, 5),
    // En kilos: manda el €/kg y salen las tres lineas.
    linea({ articulo_id: '220301', descripcion: 'PERNIL SERRA RESERVA DESOSSAT',
      unidad: 'K', precio_vta: 12.4, unidades_caja: 2, peso_neto: 6 }, 0),
    // Caja de 1: el precio de caja no se repite.
    linea({ articulo_id: '330900', descripcion: 'GEL EN ESCAMES SAC 5 KG',
      unidad: 'U', precio_vta: 2.1, unidades_caja: 1, peso_neto: 5 }, 10),
  ],
  ...extra,
});

(async () => {
  console.log('\n=== 1. QUE IDIOMA HABLA CADA SECCION ===');
  ok(textosDe('N') === TEXTOS.ca, 'Nordpirineus (N) en catalan', textosDe('N').titulo);
  ok(textosDe('M') === TEXTOS.ca, 'MAP (M) en catalan', textosDe('M').titulo);
  ok(textosDe('Y') === TEXTOS.es, 'Casa Ayestaran (Y) en castellano', textosDe('Y').titulo);
  ok(textosDe('Z') === TEXTOS.es, 'Zubillaga (Z) en castellano', textosDe('Z').titulo);
  // Lo importante de verdad: una seccion nueva no puede salir en blanco.
  ok(textosDe('Q') === TEXTOS.es, 'una seccion desconocida cae al castellano', textosDe('Q').titulo);
  ok(textosDe(null) === TEXTOS.es, 'sin seccion, castellano', textosDe(null).titulo);
  ok(textosDe(undefined) === TEXTOS.es, 'sin seccion (undefined), castellano', 'es');

  console.log('\n=== 2. LAS DOS TABLAS DE ETIQUETAS DICEN LO MISMO ===');
  // Si manana alguien anade una etiqueta al castellano y se olvida del catalan,
  // el documento catalan imprimiria "undefined". Esto lo caza antes.
  const claves = (x) => Object.keys(x).sort().join(',');
  ok(claves(TEXTOS.es) === claves(TEXTOS.ca), 'mismas claves en es y ca',
    claves(TEXTOS.es) === claves(TEXTOS.ca) ? Object.keys(TEXTOS.es).length + ' claves'
      : 'es=' + claves(TEXTOS.es) + ' / ca=' + claves(TEXTOS.ca));
  ok(claves(TEXTOS.es.cols) === claves(TEXTOS.ca.cols), 'mismas columnas en es y ca');
  ok(claves(TEXTOS.es.cols) === claves(COLS), 'y una etiqueta por cada columna dibujada',
    claves(COLS));
  ok(claves(TEXTOS.es.sufijos) === claves(TEXTOS.ca.sufijos)
    && claves(TEXTOS.es.sufijos) === 'caja,kilo,unidad', 'mismos sufijos, y los tres campos');
  ok(TEXTOS.es.legal.length === TEXTOS.ca.legal.length,
    'el texto legal tiene los mismos parrafos', TEXTOS.ca.legal.length);
  for (const k of Object.keys(TEXTOS.es)) {
    if (typeof TEXTOS.es[k] === 'string') {
      ok(typeof TEXTOS.ca[k] === 'string' && TEXTOS.ca[k].length > 0,
        '  "' + k + '" traducido', TEXTOS.ca[k]);
    }
  }

  console.log('\n=== 3. UN LISTADO EN CATALAN NO LLEVA CASTELLANO ===');
  const ca = await dibujado(listado('N'));
  ok(ca.texto.includes('LLISTAT DE PREUS'), 'el titulo va en catalan', 'LLISTAT DE PREUS');
  const castellanas = ['LISTADO DE PRECIOS', 'CLIENTE', 'Producto', 'Formato', 'Precio final',
    'CONDICIONES', 'Precios actualizados', 'Página', 'artículo', 'Código ',
    'u/cj', '/ud', '/cj'];
  for (const s of castellanas) {
    ok(!ca.texto.includes(s), '  sin "' + s + '"',
      ca.lineas.filter((l) => l.includes(s))[0]);
  }
  const catalanas = ['LLISTAT DE PREUS', 'Núm. 4321', 'CLIENT', 'Codi 304857', 'Producte',
    'Format', 'Preu', 'Preu final', '% Dte.', '3 articles', 'CONDICIONS',
    'Preus actualitzats el 24/08/2026', 'Pàgina 1 de 1', 'u/cx', '/ut', '/cx',
    'impostos no inclosos', 'formalitzar la comanda', 'omissió'];
  for (const s of catalanas) {
    ok(ca.texto.includes(s), '  con "' + s + '"', s);
  }

  console.log('\n=== 4. LOS DATOS DEL ERP NO SE TOCAN ===');
  // Lo que se pidio: solo las etiquetas. Estas cadenas vienen de la base y tienen
  // que salir letra por letra, en el idioma en que esten guardadas.
  const l0 = listado('N');
  ok(ca.texto.includes(l0.cliente_nombre), 'el nombre del cliente, tal cual', l0.cliente_nombre);
  ok(ca.texto.includes(l0.cliente_poblacion), 'la poblacion, tal cual', l0.cliente_poblacion);
  ok(ca.texto.includes(l0.vendedor_nombre), 'el vendedor, tal cual', l0.vendedor_nombre);
  ok(ca.texto.includes(l0.emisor_email), 'el correo, tal cual', l0.emisor_email);
  for (const l of l0.lineas) {
    ok(ca.texto.includes(l.descripcion), '  la descripcion', l.descripcion);
    ok(ca.texto.includes(String(l.articulo_id)), '  el codigo', l.articulo_id);
  }
  // Una descripcion en castellano en una planta catalana sigue en castellano.
  const mezcla = await dibujado(listado('N', {
    lineas: [linea({ articulo_id: '999', descripcion: 'ACEITE DE OLIVA VIRGEN EXTRA GARRAFA 5 L',
      unidad: 'U', precio_vta: 24.9, unidades_caja: 3, peso_neto: 4.6 }, 0)],
  }));
  ok(mezcla.texto.includes('ACEITE DE OLIVA VIRGEN EXTRA GARRAFA 5 L'),
    'un articulo con descripcion castellana no se traduce', 'ACEITE DE OLIVA...');
  ok(mezcla.texto.includes('LLISTAT DE PREUS'), 'pero las etiquetas siguen en catalan', 'si');

  console.log('\n=== 5. Y EL CASTELLANO SIGUE COMO ESTABA ===');
  const es = await dibujado(listado('Y'));
  for (const s of ['LISTADO DE PRECIOS', 'Nº 4321', 'CLIENTE', 'Código 304857', 'Producto',
    'Formato', 'Precio final', '% Dto.', '3 artículos', 'CONDICIONES',
    'Precios actualizados el 24/08/2026', 'Página 1 de 1', 'u/cj', '/ud', '/cj',
    'impuestos no incluidos', 'formalizar el pedido', 'omisión']) {
    ok(es.texto.includes(s), '  con "' + s + '"', s);
  }
  for (const s of ['LLISTAT', 'Producte', 'Preu', 'CONDICIONS', 'Pàgina', '/ut', '/cx']) {
    ok(!es.texto.includes(s), '  sin "' + s + '"', 'no');
  }
  // El singular tambien.
  const uno = await dibujado(listado('N', { lineas: [listado('N').lineas[0]] }));
  ok(uno.texto.includes('1 article') && !uno.texto.includes('1 articles'),
    'singular en catalan', '1 article');
  const uno2 = await dibujado(listado('Y', { lineas: [listado('Y').lineas[0]] }));
  ok(uno2.texto.includes('1 artículo') && !uno2.texto.includes('1 artículos'),
    'singular en castellano', '1 artículo');

  console.log('\n=== 6. UN CLIENTE NUEVO, EN LOS DOS IDIOMAS ===');
  for (const [seccion, aviso] of [['N', TEXTOS.ca.clienteNuevo], ['Y', TEXTOS.es.clienteNuevo]]) {
    const r = await dibujado(listado(seccion, {
      cliente_id: null, es_nuevo: true, cliente_nombre: 'BAR NOU', cliente_poblacion: 'PUIGCERDA',
    }));
    ok(r.texto.includes(aviso), '  ' + seccion + ': el aviso de cliente nuevo', aviso);
    ok(!r.texto.includes(TEXTOS.es.codigo) && !r.texto.includes(TEXTOS.ca.codigo),
      '  ' + seccion + ': y sin etiqueta de codigo', 'ninguna');
  }

  console.log('\n=== 7. LAS ETIQUETAS CATALANAS CABEN EN SUS COLUMNAS ===');
  // Mismo metodo que se uso para dimensionar la tabla: las metricas de la fuente.
  // Los anchos no cambian, asi que hay que demostrar que el catalan no desborda.
  const medidor = new PDFDocument({ size: 'A4' });
  const mide = (s, tam, negrita) => {
    medidor.fontSize(tam).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
    return medidor.widthOfString(s);
  };
  for (const [clave, c] of Object.entries(COLS)) {
    const w = mide(TEXTOS.ca.cols[clave], 8, true);
    ok(w <= c.w - 8, '  titulo "' + TEXTOS.ca.cols[clave] + '" en ' + clave,
      w.toFixed(1) + 'pt de ' + (c.w - 8) + 'pt');
  }
  // Peor caso de las columnas de importes: cinco cifras, y cada sufijo.
  for (const [idi, T] of Object.entries(TEXTOS)) {
    for (const suf of Object.values(T.sufijos)) {
      for (const [clave, tam] of [['precio', 8.5], ['final', 9]]) {
        const s = '99.999,99 €' + suf;
        const w = mide(s, tam, clave === 'final');
        ok(w <= COLS[clave].w - 8, '  ' + idi + ' "' + s + '" en ' + clave,
          w.toFixed(1) + 'pt de ' + (COLS[clave].w - 8) + 'pt');
      }
    }
    const f = '99999,9999' + T.porUnidad;
    ok(mide(f, 7.5) <= COLS.formato.w - 8, '  ' + idi + ' "' + f + '" en formato',
      mide(f, 7.5).toFixed(1) + 'pt de ' + (COLS.formato.w - 8) + 'pt');
    const g = '9999' + T.porCaja;
    ok(mide(g, 8) <= COLS.formato.w - 8, '  ' + idi + ' "' + g + '" en formato',
      mide(g, 8).toFixed(1) + 'pt de ' + (COLS.formato.w - 8) + 'pt');
  }

  console.log('\n=== 8. NI UNA PAGINA EN BLANCO, EN NINGUNO DE LOS DOS ===');
  // El texto legal catalan no ocupa lo mismo que el castellano, asi que hay que
  // volver a contar hojas: este es el fallo que ya aparecio dos veces.
  const paginas = (b) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  for (const n of [3, 27, 28, 29, 60]) {
    for (const seccion of ['N', 'Y']) {
      const base = listado(seccion).lineas;
      const r = await dibujado(listado(seccion, {
        lineas: Array.from({ length: n }, (_, i) => base[i % base.length]),
      }));
      const p = paginas(r.buf);
      ok(p >= 1 && p <= 4 && r.texto.includes(textosDe(seccion).pagina(p, p)),
        '  ' + seccion + ' con ' + n + ' articulos', p + ' pagina(s), pie en la ultima');
    }
  }

  console.log('\n=== 9. UN LISTADO DE VERDAD, CON DATOS DE NORDPIRINEUS ===');
  // Por el buscador del catalogo, que es el camino real: si manana cambia lo que
  // devuelve, esta prueba se entera.
  const cat = await servicio.buscarArticulos({ seccion: 'N', pagina: 1, por_pagina: 14 });
  if (!cat.articulos.length) {
    console.log('  (sin muestra importada: no se puede probar con datos reales)');
  } else {
    const cli = await servicio.buscarClientes({ seccion: 'N', pagina: 1, por_pagina: 1 });
    const c0 = (cli.clientes || [])[0]
      || { cliente_id: '000000', nombre: 'CLIENT DE PROVA', poblacion: 'LA SEU D\'URGELL' };
    const comun = {
      cliente_id: c0.cliente_id,
      cliente_nombre: c0.nombre,
      cliente_poblacion: c0.poblacion,
      // Los articulos tal y como los devuelve el catalogo, con su descuento de
      // tarifa: es exactamente lo que veria el comercial en pantalla.
      lineas: cat.articulos,
    };
    const r = await dibujado(listado('N', comun));
    fs.writeFileSync(path.join(__dirname, 'salida', 'listado-catalan.pdf'), r.buf);
    ok(r.texto.includes('LLISTAT DE PREUS'), 'sale en catalan', 'listado-catalan.pdf');
    ok(r.texto.includes(c0.nombre), 'con el cliente real', c0.nombre);
    const cortadas = cat.articulos.filter((a) => !r.texto.includes(a.descripcion));
    ok(!cortadas.length, 'las ' + cat.articulos.length + ' descripciones reales, enteras',
      cortadas.map((a) => a.descripcion).join(' / ') || 'ninguna recortada');

    // El gemelo en castellano, para poder comparar los dos en papel.
    const r2 = await dibujado(listado('Y', comun));
    fs.writeFileSync(path.join(__dirname, 'salida', 'listado-castellano.pdf'), r2.buf);
    ok(r2.texto.includes('LISTADO DE PRECIOS'), 'y el gemelo en castellano',
      'listado-castellano.pdf');
    // Los importes son los mismos en los dos: solo cambian las etiquetas. Se
    // compara la CIFRA sin el sufijo, porque el sufijo si esta traducido
    // ("2,73 €/ud" frente a "2,73 €/ut").
    const importes = (x) => x.lineas
      .filter((l) => l.includes('€'))
      .map((l) => l.split('€')[0].trim())
      .sort().join('|');
    ok(importes(r) === importes(r2), 'las mismas cifras en los dos idiomas',
      importes(r) === importes(r2) ? importes(r).split('|').length + ' importes identicos'
        : 'ca=' + importes(r) + ' / es=' + importes(r2));
  }

  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo correcto'));
  await pool.end();
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
