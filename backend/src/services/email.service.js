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

const construirTablaProspectingHTML = (datos) => {
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
        <h2 style="color:#003278;margin-top:0;">Prospección de Cliente de Cerveza</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          ${filas}
        </table>
        <p style="margin-top:20px;color:#666;font-size:12px;">
          Este email ha sido generado automáticamente por el sistema de prospección — Grupo Nord Pirineus.
        </p>
      </div>
    </div>
  `;
};

const enviarEmailProspecting = async ({ submission, plantaNombre, archivos, emailsPlanta, emailUsuario }) => {
  const transporter = crearTransporter();

  const datosTabla = {
    'Planta': plantaNombre,
    'Código de cliente': submission.client_code || '-',
    'Nombre del cliente': submission.client_name,
    'Dirección': submission.address,
    'Persona de contacto': submission.contact_person,
    'Teléfono contacto': submission.contact_phone,
    'Horario llamar': submission.call_schedule,
    'Actual marca de barril': submission.current_brands_text + (submission.other_brands_text ? ` (Otras: ${submission.other_brands_text})` : ''),
    '¿Tiene compromiso o contrato?': submission.contract_type_name || '-',
    'Volumen de barril aproximado semanal': submission.barrel_volume_name || '-',
    'Tipo de descuento en barril': submission.barrel_discount_type_name || '-',
    'Barriles sin cargo del proveedor actual': submission.free_barrels_name || '-',
    '¿Con cuál de nuestras marcas elaboramos la propuesta?': submission.interest_brands_text,
    '¿Qué priorizas en nuestra propuesta?': submission.proposal_priorities_text,
    'Notas adicionales': submission.notes || '-',
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

  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: emailsPlanta.join(', '),
    cc: emailUsuario || undefined,
    subject: `Prospección de Cerveza — ${submission.client_name} — ${plantaNombre}`,
    html: construirTablaProspectingHTML(datosTabla),
    attachments: adjuntos,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de prospección enviado correctamente');
  } catch (err) {
    console.error('Error al enviar email de prospección:', err);
  }
};

const construirTablaPlvHTML = (submission) => {
  const formatDate = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('es-ES');
  };

  // Agrupar lineas por group_name (preservando orden ya ordenado por SQL)
  const grupos = {};
  for (const l of submission.lines) {
    const g = l.group_name || 'Sin grupo';
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(l);
  }

  const seccionesGrupos = Object.entries(grupos).map(([nombre, lineas]) => {
    const filas = lineas.map((l) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;">${l.brand_name || '-'}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${l.article_code}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${l.article_description}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${l.units}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${formatDate(l.delivery_date)}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${formatDate(l.return_date)}</td>
      </tr>
    `).join('');
    return `
      <h3 style="color:#003278;margin-top:24px;margin-bottom:8px;">${nombre}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8f9fa;">
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Marca</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Cód. Art.</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Descripción</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:center;">Unidades</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Entrega</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Retirada</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    `;
  }).join('');

  const cabecera = `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;">
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa;font-weight:bold;width:200px;">Empresa</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${submission.company_name}</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa;font-weight:bold;">Fecha solicitud</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${formatDate(submission.request_date)}</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa;font-weight:bold;">Código cliente</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${submission.client_code}</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa;font-weight:bold;">Nombre cliente</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${submission.client_name}</td>
      </tr>
      ${submission.notes ? `
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa;font-weight:bold;vertical-align:top;">Notas</td>
        <td style="padding:6px 10px;border:1px solid #ddd;white-space:pre-wrap;">${submission.notes}</td>
      </tr>` : ''}
    </table>
  `;

  return `
    <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;">
      <div style="background:#003278;padding:16px 24px;border-radius:8px 8px 0 0;">
        <img src="cid:logo_gnp" alt="Grupo Nord Pirineus" style="height:40px;" />
      </div>
      <div style="padding:20px 24px;border:1px solid #ddd;border-top:none;">
        <h2 style="color:#003278;margin-top:0;">Petición PLV</h2>
        ${cabecera}
        ${seccionesGrupos}
        <p style="margin-top:20px;color:#666;font-size:12px;">
          Este email ha sido generado automáticamente por el sistema de petición PLV — Grupo Nord Pirineus.
        </p>
      </div>
    </div>
  `;
};

const enviarEmailPlv = async ({ submission, emailsEmpresa, emailUsuario }) => {
  const transporter = crearTransporter();
  const logoPath = path.resolve(__dirname, '../../logo_GNP.jpg');
  const adjuntos = [{ filename: 'logo_GNP.jpg', path: logoPath, cid: 'logo_gnp' }];

  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: emailsEmpresa.join(', '),
    cc: emailUsuario || undefined,
    subject: `Petición PLV — ${submission.client_name} — ${submission.company_name}`,
    html: construirTablaPlvHTML(submission),
    attachments: adjuntos,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de PLV enviado correctamente');
  } catch (err) {
    console.error('Error al enviar email PLV:', err);
  }
};

module.exports = { enviarEmailSubmission, enviarEmailProspecting, enviarEmailPlv };
