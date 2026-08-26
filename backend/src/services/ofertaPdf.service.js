// PDF del listado de precios.
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
const GRIS_SUAVE = '#888888';

const MARGEN = 50;
const ANCHO = 495;          // A4 (595) menos los dos margenes
const PIE = 770;            // donde empieza el pie de pagina

const LOGOS = path.resolve(__dirname, '../../logos');
const LOGO_GENERICO = path.resolve(__dirname, '../../logo_GNP.jpg');

/**
 * En que idioma se imprime cada planta.
 *
 * MAP y Nordpirineus emiten en catalan; Casa Ayestaran y Zubillaga, en
 * castellano, que es tambien el idioma por defecto de cualquier seccion que
 * aparezca en el futuro.
 *
 * Va por SECCION y no por usuario ni por navegador: el idioma es el del
 * documento que recibe el cliente, no una preferencia de quien lo escribe. Un
 * jefe de ventas que trabaja hoy con MAP y manana con Zubillaga emite en catalan
 * por la manana y en castellano por la tarde sin tocar nada.
 */
const IDIOMA_POR_SECCION = { M: 'ca', N: 'ca' };

/**
 * Etiquetas del impreso, en los dos idiomas.
 *
 * Aqui SOLO estan las etiquetas del formato. Lo que viene de la base de datos no
 * se traduce ni se toca: el nombre del cliente, su poblacion y la descripcion de
 * cada articulo salen del ERP y se imprimen tal cual. Traducir un dato al vuelo
 * seria inventarselo, y ademas el listado dejaria de coincidir con el albaran y
 * con la factura, que llevan la descripcion del ERP.
 *
 * Lo que si es igual en los dos idiomas queda fuera de esta tabla: el formato de
 * los importes ("1.234,50 €") y el de las fechas (dd/mm/aaaa) coinciden en
 * castellano y en catalan.
 */
const TEXTOS = {
  es: {
    locale: 'es-ES',
    titulo: 'LISTADO DE PRECIOS',
    numero: 'Nº ',
    cliente: 'CLIENTE',
    codigo: 'Código ',
    clienteNuevo: 'Cliente nuevo, sin código en el sistema',
    cols: {
      producto: 'Producto',
      formato: 'Formato',
      precio: 'Precio',
      dto: '% Dto.',
      final: 'Precio final',
    },
    // Columna Formato: "24u/cj", "6 kg/u".
    porCaja: 'u/cj',
    porUnidad: ' kg/u',
    // Sufijos de las columnas de importes, por el campo de `presentacion`.
    sufijos: { kilo: '/kg', unidad: '/ud', caja: '/cj' },
    recuento: (n) => n + (n === 1 ? ' artículo' : ' artículos'),
    condiciones: 'CONDICIONES',
    /**
     * Los precios de `articulos_sec` son la base imponible: no llevan NINGUN
     * impuesto. Ademas del IVA hay otros que se anaden segun el articulo y el
     * cliente, y de ahi que la frase hable de impuestos en plural y no solo del
     * IVA: el ERP guarda `ibee_id` por articulo y las banderas `ibee` y
     * `puntoverde` por cliente, precisamente porque no van dentro del precio.
     *
     * NO se enumeran por nombre. Este documento lo emiten las cuatro plantas y
     * los impuestos que aplica cada una no son los mismos, asi que una lista
     * concreta seria incorrecta en algunas y confundiria en el resto. El plural
     * generico es cierto en las cuatro.
     */
    legal: [
      'Precios en euros, impuestos no incluidos. Al importe indicado se añadirán los impuestos ' +
      'y recargos que resulten aplicables en cada caso.',
      'Este listado tiene carácter informativo y no constituye oferta contractual. Los precios y ' +
      'descuentos indicados pueden variar sin previo aviso y quedan sujetos a confirmación en el ' +
      'momento de formalizar el pedido.',
      'Los descuentos reflejados no son acumulables con otras promociones u ofertas vigentes, salvo ' +
      'indicación expresa. Los portes, envases y depósitos retornables se facturan aparte según las ' +
      'condiciones generales de venta.',
      'Documento válido salvo error tipográfico u omisión.',
    ],
    preciosDe: 'Precios actualizados el ',
    pagina: (i, n) => 'Página ' + i + ' de ' + n,
  },

  ca: {
    locale: 'ca-ES',
    titulo: 'LLISTAT DE PREUS',
    numero: 'Núm. ',
    cliente: 'CLIENT',
    codigo: 'Codi ',
    clienteNuevo: 'Client nou, sense codi al sistema',
    cols: {
      producto: 'Producte',
      formato: 'Format',
      precio: 'Preu',
      dto: '% Dte.',
      final: 'Preu final',
    },
    // "cx" de caixa y "ut" de unitat, para que las tres abreviaturas de las
    // columnas de importes ("/kg", "/ut", "/cx") sigan alineando igual.
    porCaja: 'u/cx',
    porUnidad: ' kg/u',
    sufijos: { kilo: '/kg', unidad: '/ut', caja: '/cx' },
    recuento: (n) => n + (n === 1 ? ' article' : ' articles'),
    condiciones: 'CONDICIONS',
    legal: [
      'Preus en euros, impostos no inclosos. A l\'import indicat s\'hi afegiran els impostos ' +
      'i recàrrecs que resultin aplicables en cada cas.',
      'Aquest llistat té caràcter informatiu i no constitueix oferta contractual. Els preus i ' +
      'descomptes indicats poden variar sense avís previ i queden subjectes a confirmació en el ' +
      'moment de formalitzar la comanda.',
      'Els descomptes reflectits no són acumulables amb altres promocions o ofertes vigents, tret ' +
      'd\'indicació expressa. Els ports, envasos i dipòsits retornables es facturen a part segons ' +
      'les condicions generals de venda.',
      'Document vàlid excepte error tipogràfic o omissió.',
    ],
    preciosDe: 'Preus actualitzats el ',
    pagina: (i, n) => 'Pàgina ' + i + ' de ' + n,
  },
};

const textosDe = (seccion) => TEXTOS[IDIOMA_POR_SECCION[seccion]] || TEXTOS.es;

/** 1234.5 -> "1.234,50 €". Mismo formato en castellano y en catalan. */
const eur = (n) => {
  if (n === null || n === undefined) return '—';
  const s = Number(n).toFixed(2).split('.');
  return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1] + ' €';
};

/** 5 -> "5 %", 0 -> "—" (un cero no aporta nada y llena la columna de ruido). */
const pct = (n) => (Number(n) > 0 ? String(Number(n)).replace('.', ',') + ' %' : '—');

/** 3.2 -> "3,2" */
const num = (n) => String(Number(n)).replace('.', ',');

const fecha = (d, locale) => new Date(d).toLocaleDateString(locale || 'es-ES',
  { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Cinco columnas, con varias lineas por articulo.
 *
 * Los anchos NO estan puestos a ojo: se midieron con las metricas de la propia
 * fuente sobre las 1.559 descripciones reales del catalogo (la mas larga son
 * 211pt a 8,5pt) y sobre el peor caso de cada columna de importes. El texto va
 * con lineBreak:false, asi que lo que no cabe se corta en silencio, y por eso
 * cada columna se dimensiona por el maximo entre su titulo y su peor valor.
 *
 * Los anchos son los mismos en los dos idiomas: las etiquetas catalanas son mas
 * cortas que las castellanas y los sufijos miden practicamente igual, asi que el
 * peor caso sigue siendo el del castellano.
 */
const COLS = {
  producto: { x: 0, w: 240 },
  // 68 y no 62: "99999,9999 kg/u" mide 55,9pt, y Producto tiene holgura de
  // sobra (la descripcion mas larga del catalogo son 211pt).
  formato: { x: 240, w: 68 },
  precio: { x: 308, w: 66, dcha: true },
  dto: { x: 374, w: 42, dcha: true },
  final: { x: 416, w: 79, dcha: true },
};

const cabeceraTabla = (doc, y, t) => {
  doc.rect(MARGEN, y, ANCHO, 18).fill(AZUL);
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  for (const [clave, c] of Object.entries(COLS)) {
    doc.text(t.cols[clave], MARGEN + c.x + 4, y + 5,
      { width: c.w - 8, align: c.dcha ? 'right' : 'left', lineBreak: false });
  }
  return y + 18;
};

/** Escribe una celda de varias lineas. Cada linea: {texto, tam, color, fuente}. */
const celda = (doc, col, y, lineas) => {
  let dy = 5;
  for (const l of lineas) {
    if (!l) continue;
    doc.fillColor(l.color || '#000000')
      .fontSize(l.tam || 8.5)
      .font(l.fuente || 'Helvetica')
      .text(l.texto, MARGEN + col.x + 4, y + dy,
        { width: col.w - 8, align: col.dcha ? 'right' : 'left', lineBreak: false });
    dy += (l.tam || 8.5) + 2.2;
  }
};

/**
 * @param {object} o  el listado con sus lineas, tal y como lo devuelve el
 *                    controlador: { id, created_at, seccion_id, cliente_*,
 *                    vendedor_nombre, emisor_email, logo_path, lineas[],
 *                    precios_de }
 */
const generarPdfOferta = (o) => new Promise((resolve, reject) => {
  // El idioma sale de la seccion que emite, no de quien pulsa el boton.
  const t = textosDe(o.seccion_id);

  const doc = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true });
  const trozos = [];
  doc.on('data', (x) => trozos.push(x));
  doc.on('end', () => resolve(Buffer.concat(trozos)));
  doc.on('error', reject);

  // --- Cabecera: logotipo de la planta ---
  const logo = o.logo_path ? path.join(LOGOS, o.logo_path) : null;
  try {
    // fit en una caja para que da igual la proporcion del logotipo: los cuatro
    // tienen anchos distintos (de 528 a 899 px).
    doc.image(logo && fs.existsSync(logo) ? logo : LOGO_GENERICO, MARGEN, 40, { fit: [170, 42] });
  } catch (_) {
    // Sin logotipo el documento sigue siendo valido; no se aborta por una imagen.
  }

  doc.fillColor(AZUL).fontSize(18).font('Helvetica-Bold')
    .text(t.titulo, MARGEN, 44, { width: ANCHO, align: 'right' });
  doc.fillColor(GRIS_TEXTO).fontSize(9).font('Helvetica')
    .text(t.numero + o.id + '  ·  ' + fecha(o.created_at, t.locale), MARGEN, 66,
      { width: ANCHO, align: 'right' });

  doc.moveTo(MARGEN, 92).lineTo(MARGEN + ANCHO, 92).strokeColor(AZUL).lineWidth(2).stroke();

  // --- Cliente ---
  let y = 108;
  doc.fillColor(GRIS_TEXTO).fontSize(8).font('Helvetica-Bold').text(t.cliente, MARGEN, y);
  y += 13;
  doc.fillColor('#000000').fontSize(13).font('Helvetica-Bold')
    .text(o.cliente_nombre, MARGEN, y, { width: 330 });
  y = doc.y + 2;

  const detalle = [];
  // El codigo solo si lo hay: un cliente nuevo todavia no tiene.
  if (o.cliente_id) detalle.push(t.codigo + o.cliente_id);
  if (o.cliente_poblacion) detalle.push(o.cliente_poblacion);
  if (detalle.length) {
    doc.fillColor('#333333').fontSize(10).font('Helvetica')
      .text(detalle.join('  ·  '), MARGEN, y, { width: 330 });
    y = doc.y;
  }
  if (o.es_nuevo) {
    doc.fillColor(GRIS_TEXTO).fontSize(8).font('Helvetica-Oblique')
      .text(t.clienteNuevo, MARGEN, y + 2);
    y = doc.y;
  }

  // Quien emite el listado, a la derecha del cliente.
  //
  // No se pone el nombre de la planta: ya lo dice el logotipo de la cabecera, y
  // repetirlo quitaba sitio al dato que el cliente necesita, que es a quien
  // escribir.
  //
  // El nombre sale SOLO si quien emite tiene ficha de vendedor en el ERP. Un
  // usuario sin ficha -- un jefe, un administrativo -- deja solo el correo: poner
  // ahi el nombre de la cuenta de la aplicacion no le dice nada al cliente.
  //
  // Ni el nombre ni el correo se traducen: son datos, no etiquetas.
  //
  // 155pt de ancho y con salto permitido, porque "CLAUDIO BOGDAN IORGULESCU"
  // mide 142,7pt y hay nombres mas largos.
  const yDcha = 121;
  let yEmisor = yDcha;
  if (o.vendedor_nombre) {
    // 9pt y no 10: a 10 los nombres mas largos del grupo (161pt) se partirian
    // en dos lineas y empujarian el correo.
    doc.fillColor('#333333').fontSize(9).font('Helvetica-Bold')
      .text(o.vendedor_nombre, MARGEN + 340, yEmisor, { width: 155, align: 'right' });
    yEmisor = doc.y + 1;
  }
  if (o.emisor_email) {
    // A 8pt: los correos del grupo llegan a 36 caracteres
    // ("oihana.f.arratibel@casaayestaran.com") y a 10pt no cabrian en 155pt.
    doc.fillColor(GRIS_TEXTO).fontSize(8).font('Helvetica')
      .text(o.emisor_email, MARGEN + 340, yEmisor, { width: 155, align: 'right' });
  }

  y = Math.max(y, yDcha + 30) + 16;

  // --- Tabla ---
  y = cabeceraTabla(doc, y, t);

  let alterna = false;
  for (const l of o.lineas) {
    // El alto depende de cuantas lineas de precio se ensenen de verdad, no de si
    // el articulo es de kilos: un articulo en kilos de 1 kg con 1 u/caja tiene
    // los tres precios iguales y ocupa una sola linea.
    const pres = l.presentacion || [];
    const alto = pres.length >= 3 ? 35 : pres.length === 2 ? 27 : 22;

    if (y + alto > PIE - 20) {
      doc.addPage();
      y = cabeceraTabla(doc, MARGEN, t);
      alterna = false;
    }
    if (alterna) doc.rect(MARGEN, y, ANCHO, alto).fill(GRIS_FILA);
    alterna = !alterna;

    // Producto: descripcion y, debajo y mas pequeno, el codigo. Los dos vienen
    // del ERP y van tal cual en los dos idiomas.
    celda(doc, COLS.producto, y, [
      { texto: l.descripcion, tam: 8.5 },
      { texto: l.articulo_id, tam: 7, color: GRIS_SUAVE },
    ]);

    // Formato: unidades por caja y, si se factura en kilos, el peso por unidad.
    celda(doc, COLS.formato, y, [
      l.unidades_caja ? { texto: num(l.unidades_caja) + t.porCaja, tam: 8 } : null,
      l.es_kilo && l.peso_neto
        ? { texto: num(l.peso_neto) + t.porUnidad, tam: 7.5, color: GRIS_TEXTO }
        : null,
    ]);

    // Precio de tarifa. El orden y las omisiones vienen dados en
    // `presentacion`: con kilos manda el €/kg, y no se repite un importe que
    // seria el mismo (1 u/caja, 1 kg/u).
    //
    // El sufijo se saca del idioma por el campo, y no del `sufijo` que trae
    // `presentacion`: ese es el que ve el comercial en pantalla, que va siempre
    // en castellano porque la aplicacion es interna.
    const destacado = { tam: 8.5 };
    const secundario = { tam: 7.5, color: GRIS_TEXTO };
    celda(doc, COLS.precio, y, pres.map((x) => ({
      texto: eur(l['precio_' + x.campo]) + t.sufijos[x.campo],
      ...(x.principal ? destacado : secundario),
    })));

    doc.fillColor(Number(l.dto_pct) > 0 ? AZUL : GRIS_SUAVE)
      .fontSize(9).font(Number(l.dto_pct) > 0 ? 'Helvetica-Bold' : 'Helvetica')
      .text(pct(l.dto_pct), MARGEN + COLS.dto.x + 4, y + 6,
        { width: COLS.dto.w - 8, align: 'right', lineBreak: false });

    // Precio final: mismo orden, y el principal en negrita.
    const fuerte = { tam: 9, fuente: 'Helvetica-Bold' };
    celda(doc, COLS.final, y, pres.map((x) => ({
      texto: eur(l['precio_final_' + x.campo]) + t.sufijos[x.campo],
      ...(x.principal ? fuerte : secundario),
    })));

    doc.moveTo(MARGEN, y + alto).lineTo(MARGEN + ANCHO, y + alto)
      .strokeColor(GRIS_BORDE).lineWidth(0.5).stroke();
    y += alto;
  }

  doc.fillColor(GRIS_TEXTO).fontSize(8).font('Helvetica')
    .text(t.recuento(o.lineas.length), MARGEN, y + 5, { width: ANCHO, align: 'right' });
  y += 22;

  // --- Texto legal ---
  //
  // Va al final del contenido y no en el pie de cada pagina: son cuatro
  // parrafos y repetirlos en cada hoja se comeria la tabla.
  if (y > PIE - 90) { doc.addPage(); y = MARGEN; }
  doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y)
    .strokeColor(GRIS_BORDE).lineWidth(0.5).stroke();
  y += 8;
  doc.fillColor(GRIS_SUAVE).fontSize(6.5).font('Helvetica-Bold')
    .text(t.condiciones, MARGEN, y);
  y += 10;
  doc.fillColor(GRIS_TEXTO).fontSize(6.8).font('Helvetica');
  for (const p of t.legal) {
    doc.text(p, MARGEN, y, { width: ANCHO, align: 'justify' });
    y = doc.y + 2.5;
  }

  // --- Pie: de cuando son los precios ---
  //
  // La fecha de los precios va en el pie del listado, no la del ultimo sync de
  // cualquier cosa: es la de erp.articulos_sec, que es de donde salen estos
  // importes (CONTRATO-SYNC.md, tabla de frescura).
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    // El pie se dibuja POR DEBAJO del area de contenido (un A4 con margen 50
    // acaba en y=792). Con el margen inferior intacto, pdfkit interpreta que no
    // cabe y anade una pagina en blanco: de ahi que haya que anularlo antes.
    doc.page.margins.bottom = 0;
    doc.moveTo(MARGEN, 792).lineTo(MARGEN + ANCHO, 792)
      .strokeColor(GRIS_BORDE).lineWidth(0.5).stroke();
    doc.fillColor(GRIS_TEXTO).fontSize(7.5).font('Helvetica');
    if (o.precios_de) {
      doc.text(t.preciosDe + fecha(o.precios_de, t.locale), MARGEN, 798, { width: 300 });
    }
    doc.text(t.pagina(i + 1, rango.count), MARGEN, 798, { width: ANCHO, align: 'right' });
  }

  doc.end();
});

module.exports = {
  generarPdfOferta, eur, pct, num, fecha,
  COLS, TEXTOS, IDIOMA_POR_SECCION, textosDe,
};
