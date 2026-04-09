const nodemailer = require('nodemailer');
const path = require('path');
const { generarPdfSubmission } = require('./pdf.service');

const crearTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const construirTablaHTML = (datos) => {
  const filas = Object.entries(datos)
    .map(([campo, valor]) => {
      return `<tr>
        <td style="padding:8px 12px;border:1px solid #ddd;background:#f8f9fa;font-weight:bold;width:200px;">${campo}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;">${valor ?? '-'}</td>
      </tr>`;
    })
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <div style="background:#003278;padding:16px 24px;border-radius:8px 8px 0 0;">
        <img src="cid:logo_gnp" alt="Grupo Nord Pirineus" style="height:40px;" />
      </div>
      <div style="padding:20px 24px;border:1px solid #ddd;border-top:none;">
        <h2 style="color:#003278;margin-top:0;">Nueva Alta de Cliente</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          ${filas}
        </table>
        <p style="margin-top:20px;color:#666;font-size:12px;">
          Este email ha sido generado automáticamente por el sistema de altas de clientes — Grupo Nord Pirineus.
        </p>
      </div>
    </div>
  `;
};

const enviarEmailSubmission = async ({ submission, plantaNombre, archivos, emailsPlanta, emailUsuario }) => {
  const transporter = crearTransporter();

  const datosTabla = {
    'Planta': plantaNombre,
    'Comercial (maestro)': submission.commercial_name_master || '-',
    'Acción de cliente': submission.client_action_name || '-',
    'Grupo de cliente': submission.group_code,
    'Código anterior': submission.previous_code,
    'Punto de venta': submission.point_of_sale,
    'Nombre comercial': submission.commercial_name,
    'Segmentación económica': submission.economic_segmentation,
    'Razón social': submission.business_name,
    'NIF/CIF': submission.nif_cif,
    'Dirección': submission.street_address,
    'Código postal': submission.postal_code,
    'Población': submission.city,
    'Teléfono': submission.phone,
    'Email contacto': submission.contact_email,
    'Email facturación': submission.billing_email,
    'Clase de cliente': submission.client_class_name || '-',
    'Tipo de facturación': submission.billing_type_name || '-',
    'Forma de pago': submission.payment_method_name || '-',
    'Días de visita': submission.visit_days,
    'Posición de cliente': submission.client_position,
    'Periodo de visita': submission.visit_period_name || '-',
    'Televenta': submission.telesales ? 'Sí' : 'No',
    'Cliente barril': submission.barrel_client ? 'Sí' : 'No',
    'Días de reparto': submission.delivery_days,
    'Horario reparto': `${submission.delivery_time_start} - ${submission.delivery_time_end}`,
    'Días de descanso': submission.rest_days,
    'Pedido mañana': submission.morning_order ? 'Sí' : 'No',
    'Observaciones': submission.observations,
  };

  const adjuntos = (archivos || []).map((f) => ({
    filename: f.original_name,
    path: path.resolve(f.stored_path),
  }));

  // Logo embebido en el email
  const logoPath = path.resolve(__dirname, '../../logo_GNP.jpg');
  adjuntos.push({
    filename: 'logo_GNP.jpg',
    path: logoPath,
    cid: 'logo_gnp',
  });

  // Generar PDF con los datos del formulario
  try {
    const tituloPdf = `Nueva Alta de Cliente — ${submission.commercial_name}`;
    const pdfBuffer = await generarPdfSubmission(datosTabla, tituloPdf);
    adjuntos.push({
      filename: `Alta_${submission.commercial_name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
  } catch (err) {
    console.error('Error al generar PDF de submission:', err);
    // No bloqueamos el envio del email si falla la generacion del PDF
  }

  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: emailsPlanta.join(', '),
    cc: emailUsuario || undefined,
    subject: `Nueva Alta de Cliente — ${submission.commercial_name} — ${plantaNombre}`,
    html: construirTablaHTML(datosTabla),
    attachments: adjuntos,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de submission enviado correctamente');
  } catch (err) {
    console.error('Error al enviar email de submission:', err);
    // No lanzamos error para no bloquear la submission
  }
};

module.exports = { enviarEmailSubmission };
