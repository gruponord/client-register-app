// PDF de una oferta de precios.
//
// Sigue las convenciones del pdf.service.js que ya existe: pdfkit, A4, margen
// 50, el azul corporativo y un Buffer devuelto por promesa. La diferencia es que
// aqui el logotipo es el de la PLANTA, no el generico del grupo.
//
// Los importes NO se recalculan aqui: llegan ya calculados desde
// precios.service.js, el mismo que uso el catalogo y el guardado. Si este
// fichero hiciese sus propias cuentas, un dia el papel diria un precio y la
// pantalla otro.
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const AZUL = '#003278';
const GRIS_FILA = '#f8f9fa';
const GRIS_BORDE = '#dddddd';
const GRIS_TEXTO = '#666666';

const MARGEN = 50;
const ANCHO = 495;          // A4 (595) menos los dos margenes
const PIE = 780;            // donde empieza el pie de pagina

const LOGOS = path.resolve(__dirname, '../../logos');
const LOGO_GENERICO = path.resolve(__dirname, '../../logo_GNP.jpg');

/** 1234.5 -> "1.234,50 €". Formato espanol, que es el del documento. */
const eur = (n) => {
  if (n === null || n === undefined) return '—';
  const s = Number(n).toFixed(2).split('.');
  const enteros = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return enteros + ',' + s[1] + ' €';
};

/** 5 -> "5 %", 0 -> "—" (un cero no aporta nada y llena la columna de ruido). */
const pct = (n) => (Number(n) > 0 ? String(Number(n)).replace('.', ',') + ' %' : '—');

const fecha = (d) => new Date(d).toLocaleDateString('es-ES',
  { day: '2-digit', month: '2-digit', year: 'numeric' });

// Las columnas del punto 4 del enunciado. La unidad no lleva columna propia:
// solo dice algo cuando el articulo se factura en kilos, y entonces va como
// segunda linea bajo la descripcion.
//
// Los anchos NO estan puestos a ojo. Se midieron con las metricas de la propia
// fuente sobre las 1.559 descripciones reales del catalogo y sobre el peor caso
// de cada columna numerica:
//
//   descripcion   maximo real 211pt a 8.5pt (mediana 147)
//   codigo        28,4pt -- son 6 digitos, aunque el ERP declare varchar(25)
//   final caja    44,9pt incluso con "99.999,99 €"
//   titulos       "Precio ud." es el mas ancho con 38,7pt a 8pt negrita
//
// Cada columna se dimensiona por el maximo entre su titulo y su peor valor, mas
// 6pt de aire, y a la descripcion se le da todo lo que sobra. La primera version
// le daba 175pt y una descripcion real de 40 caracteres se cortaba en silencio,
// porque el texto va con lineBreak:false.
const COLS = [
  { clave: 'articulo_id', titulo: 'Código', x: 0, w: 40 },
  { clave: 'descripcion', titulo: 'Descripción', x: 40, w: 241 },
  { clave: 'unidades_caja', titulo: 'Uds/caja', x: 281, w: 40, dcha: true },
  { clave: 'precio_unidad', titulo: 'Precio ud.', x: 321, w: 46, dcha: true, dinero: true },
  { clave: 'dto_pct', titulo: 'Dto.', x: 367, w: 34, dcha: true, porcentaje: true },
  { clave: 'precio_final_unidad', titulo: 'Final ud.', x: 401, w: 42, dcha: true, dinero: true },
  { clave: 'precio_final_caja', titulo: 'Final caja', x: 443, w: 52, dcha: true, dinero: true },
];

const cabeceraTabla = (doc, y) => {
  doc.rect(MARGEN, y, ANCHO, 20).fill(AZUL);
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  for (const c of COLS) {
    doc.text(c.titulo, MARGEN + c.x + 3, y + 6,
      { width: c.w - 6, align: c.dcha ? 'right' : 'left' });
  }
  return y + 20;
};

/**
 * @param {object} o  la oferta con sus lineas, tal y como la devuelve el
 *                    controlador: { id, created_at, cliente_*, vendedor_*,
 *                    planta_nombre, logo_path, lineas[], precios_de }
 */
const generarPdfOferta = (o) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: MARGEN });
  const trozos = [];
  doc.on('data', (t) => trozos.push(t));
  doc.on('end', () => resolve(Buffer.concat(trozos)));
  doc.on('error', reject);

  // --- Cabecera: logotipo de la planta ---
  const logo = o.logo_path ? path.join(LOGOS, o.logo_path) : null;
  try {
    // fitea dentro de una caja para que da igual la proporcion del logotipo:
    // los cuatro tienen anchos distintos (de 528 a 899 px).
    doc.image(fs.existsSync(logo) ? logo : LOGO_GENERICO, MARGEN, 40, { fit: [170, 42] });
  } catch (_) {
    // Sin logotipo el documento sigue siendo valido; no se aborta por una imagen.
  }

  doc.fillColor(AZUL).fontSize(18).font('Helvetica-Bold')
    .text('OFERTA DE PRECIOS', MARGEN, 44, { width: ANCHO, align: 'right' });
  doc.fillColor(GRIS_TEXTO).fontSize(9).font('Helvetica')
    .text('Nº ' + o.id + '  ·  ' + fecha(o.created_at), MARGEN, 66,
      { width: ANCHO, align: 'right' });

  doc.moveTo(MARGEN, 92).lineTo(MARGEN + ANCHO, 92).strokeColor(AZUL).lineWidth(2).stroke();

  // --- Cliente ---
  let y = 108;
  doc.fillColor(GRIS_TEXTO).fontSize(8).font('Helvetica-Bold').text('CLIENTE', MARGEN, y);
  y += 13;
  doc.fillColor('#000000').fontSize(13).font('Helvetica-Bold')
    .text(o.cliente_nombre, MARGEN, y, { width: 330 });
  y = doc.y + 2;

  const detalle = [];
  // El codigo solo si lo hay: un cliente nuevo todavia no tiene.
  if (o.cliente_id) detalle.push('Código ' + o.cliente_id);
  if (o.cliente_poblacion) detalle.push(o.cliente_poblacion);
  if (detalle.length) {
    doc.fillColor('#333333').fontSize(10).font('Helvetica')
      .text(detalle.join('  ·  '), MARGEN, y, { width: 330 });
    y = doc.y;
  }
  if (o.es_nuevo) {
    doc.fillColor(GRIS_TEXTO).fontSize(8).font('Helvetica-Oblique')
      .text('Cliente nuevo, sin código en el sistema', MARGEN, y + 2);
    y = doc.y;
  }

  // Planta y vendedor, a la derecha del cliente.
  // 155pt de ancho y se deja partir en dos lineas: "CLAUDIO BOGDAN IORGULESCU"
  // mide 142,7pt, y hay nombres de vendedor mas largos que ese.
  const yDcha = 121;
  doc.fillColor(GRIS_TEXTO).fontSize(9).font('Helvetica')
    .text(o.planta_nombre || '', MARGEN + 340, yDcha, { width: 155, align: 'right' });
  if (o.vendedor_nombre) {
    doc.text(o.vendedor_nombre, MARGEN + 340, yDcha + 13, { width: 155, align: 'right' });
  }

  y = Math.max(y, yDcha + 30) + 16;

  // --- Tabla de articulos ---
  y = cabeceraTabla(doc, y);

  let alterna = false;
  for (const l of o.lineas) {
    // Un articulo de kilos necesita dos lineas: la descripcion y el aviso.
    const avisoKilo = l.es_kilo
      ? 'Se factura en kilos · cada unidad pesa ' +
        String(Number(l.peso_neto)).replace('.', ',') + ' kg'
      : null;
    const alto = avisoKilo ? 30 : 18;

    if (y + alto > PIE - 30) {
      doc.addPage();
      y = cabeceraTabla(doc, MARGEN);
      alterna = false;
    }

    if (alterna) doc.rect(MARGEN, y, ANCHO, alto).fill(GRIS_FILA);
    alterna = !alterna;

    doc.fillColor('#000000').fontSize(8.5).font('Helvetica');
    for (const c of COLS) {
      let v = l[c.clave];
      if (c.dinero) v = eur(v);
      else if (c.porcentaje) v = pct(v);
      else if (v === null || v === undefined) v = '';
      doc.text(String(v), MARGEN + c.x + 3, y + 5,
        { width: c.w - 6, align: c.dcha ? 'right' : 'left', lineBreak: false });
    }
    if (avisoKilo) {
      doc.fillColor(AZUL).fontSize(7.5).font('Helvetica-Oblique')
        .text(avisoKilo, MARGEN + COLS[1].x + 3, y + 17, { width: 280, lineBreak: false });
    }

    doc.moveTo(MARGEN, y + alto).lineTo(MARGEN + ANCHO, y + alto)
      .strokeColor(GRIS_BORDE).lineWidth(0.5).stroke();
    y += alto;
  }

  doc.fillColor(GRIS_TEXTO).fontSize(8).font('Helvetica')
    .text(o.lineas.length + (o.lineas.length === 1 ? ' artículo' : ' artículos'),
      MARGEN, y + 6, { width: ANCHO, align: 'right' });

  // --- Pie: de cuando son los precios ---
  //
  // La fecha de los precios va en el pie de la oferta, no la del ultimo sync de
  // cualquier cosa: es la de erp.articulos_sec, que es de donde salen estos
  // importes (CONTRATO-SYNC.md, tabla de frescura).
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    doc.moveTo(MARGEN, PIE).lineTo(MARGEN + ANCHO, PIE)
      .strokeColor(GRIS_BORDE).lineWidth(0.5).stroke();
    doc.fillColor(GRIS_TEXTO).fontSize(7.5).font('Helvetica');
    if (o.precios_de) {
      doc.text('Precios actualizados el ' + fecha(o.precios_de), MARGEN, PIE + 6, { width: 300 });
    }
    doc.text('Página ' + (i + 1) + ' de ' + rango.count, MARGEN, PIE + 6,
      { width: ANCHO, align: 'right' });
  }

  doc.end();
});

module.exports = { generarPdfOferta, eur, pct };
