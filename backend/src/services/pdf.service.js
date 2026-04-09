const PDFDocument = require('pdfkit');
const path = require('path');

const LOGO_PATH = path.resolve(__dirname, '../../logo_GNP.jpg');
const COLOR_PRIMARIO = '#003278';
const COLOR_FONDO_FILA = '#f8f9fa';
const COLOR_BORDE = '#dddddd';

/**
 * Genera un Buffer PDF con los datos de la submission.
 * @param {Object} datosTabla - Objeto clave-valor con los campos del formulario
 * @param {string} titulo - Titulo del documento
 * @returns {Promise<Buffer>} Buffer del PDF generado
 */
const generarPdfSubmission = (datosTabla, titulo) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Cabecera con logo ---
    try {
      doc.image(LOGO_PATH, 50, 40, { height: 35 });
    } catch (_) {
      // Si no se puede cargar el logo, seguimos sin el
    }

    // Linea decorativa bajo cabecera
    doc
      .moveTo(50, 85)
      .lineTo(545, 85)
      .strokeColor(COLOR_PRIMARIO)
      .lineWidth(2)
      .stroke();

    // --- Titulo ---
    doc
      .fontSize(16)
      .fillColor(COLOR_PRIMARIO)
      .text(titulo, 50, 100, { align: 'center' });

    // Fecha de generacion
    const fecha = new Date().toLocaleString('es-ES', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(`Generado el ${fecha}`, 50, 125, { align: 'center' });

    // --- Tabla de datos ---
    const startY = 150;
    const colIzq = 50;
    const colDer = 220;
    const anchoIzq = 170;
    const anchoDer = 325;
    const paddingVertical = 6;
    let y = startY;

    const entradas = Object.entries(datosTabla);

    for (let i = 0; i < entradas.length; i++) {
      const [campo, valor] = entradas[i];
      const textoValor = (valor ?? '-').toString();

      // Calcular altura necesaria para el valor
      const alturaTexto = doc.heightOfString(textoValor, {
        width: anchoDer - 12,
        fontSize: 10,
      });
      const alturaFila = Math.max(alturaTexto + paddingVertical * 2, 28);

      // Salto de pagina si no cabe
      if (y + alturaFila > 770) {
        doc.addPage();
        y = 50;
      }

      // Fondo alterno
      if (i % 2 === 0) {
        doc
          .rect(colIzq, y, anchoIzq + anchoDer, alturaFila)
          .fill(COLOR_FONDO_FILA);
      }

      // Bordes
      doc
        .rect(colIzq, y, anchoIzq, alturaFila)
        .strokeColor(COLOR_BORDE)
        .lineWidth(0.5)
        .stroke();
      doc
        .rect(colDer, y, anchoDer, alturaFila)
        .strokeColor(COLOR_BORDE)
        .lineWidth(0.5)
        .stroke();

      // Texto campo (negrita)
      doc
        .fontSize(10)
        .fillColor('#333333')
        .font('Helvetica-Bold')
        .text(campo, colIzq + 6, y + paddingVertical, {
          width: anchoIzq - 12,
        });

      // Texto valor
      doc
        .font('Helvetica')
        .fillColor('#000000')
        .text(textoValor, colDer + 6, y + paddingVertical, {
          width: anchoDer - 12,
        });

      y += alturaFila;
    }

    // --- Pie de pagina ---
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(
        'Este documento ha sido generado automaticamente por el sistema de altas de clientes — Grupo Nord Pirineus.',
        50,
        y + 30,
        { align: 'center', width: 495 }
      );

    doc.end();
  });
};

module.exports = { generarPdfSubmission };
