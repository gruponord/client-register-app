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

/**
 * Manda una oferta de precios al cliente, con el PDF adjunto.
 *
 * A diferencia de los otros correos de la app, este va DIRIGIDO AL CLIENTE y no
 * a los buzones internos de la planta: el comercial escribe la direccion. Por
 * eso el cuerpo es corto y sin tablas -- el detalle esta en el PDF -- y no se
 * mete el logotipo por cid, que muchos clientes de correo bloquean y deja un
 * hueco raro. El logotipo ya va dentro del documento.
 */
const enviarEmailOferta = async (destinatario, oferta, pdfBuffer) => {
  const transporter = crearTransporter();
  const nombre = oferta.cliente_nombre || 'cliente';
  const firma = oferta.vendedor_nombre || oferta.usuario_nombre || '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#333;line-height:1.6;">
      <p>Hola,</p>
      <p>Te adjuntamos la oferta de precios para <strong>${nombre}</strong>.</p>
      <p>Si tienes cualquier duda, responde a este correo.</p>
      <p style="margin-top:24px;">
        Un saludo,<br/>
        ${firma ? firma + '<br/>' : ''}
        ${oferta.planta_nombre || 'Grupo Nord'}
      </p>
    </div>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: destinatario,
    subject: 'Oferta de precios - ' + nombre,
    html,
    attachments: [{
      filename: 'oferta-' + oferta.id + '.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
};

/**
 * Aviso de que la replica del ERP se ha quedado sin datos frescos.
 *
 * Un correo por COMPROBACION y no uno por dataset, y eso es deliberado: el caso
 * que de verdad importa es que se apague el servidor del agente, y entonces los
 * diez datasets envejecen a la vez. Con un correo por dataset serian diez
 * mensajes del mismo incidente, y diez mensajes iguales se leen como ruido y se
 * acaban filtrando -- que es justo lo que no puede pasar con este aviso.
 *
 * Se manda en texto plano ademas del HTML: esto lo va a leer alguien de
 * sistemas, probablemente en el movil y con prisa.
 *
 * @param {string[]} destinatarios
 * @param {object[]} rotos         datasets que acaban de quedarse viejos
 * @param {object[]} recordados    incidencias abiertas que se recuerdan
 * @param {object[]} recuperados   datasets que han vuelto a recibir datos
 */
const enviarEmailAlertaSync = async (destinatarios, { rotos, recordados, recuperados }) => {
  const transporter = crearTransporter();

  const nHoras = (d) => (d.horas_desde === null
    ? 'nunca ha recibido nada'
    : String(d.horas_desde).replace('.', ',') + ' h sin recibir (umbral ' + d.frescura_horas + ' h)');

  // El asunto tiene que decir el que y el cuanto sin abrir el correo.
  const asunto = rotos.length
    ? 'ALERTA replica ERP: ' + rotos.length + ' dataset' + (rotos.length === 1 ? '' : 's') +
      ' sin datos frescos'
    : recordados.length
      ? 'ALERTA replica ERP (sigue): ' + recordados.length + ' dataset' +
        (recordados.length === 1 ? '' : 's') + ' sin datos frescos'
      : 'Replica ERP recuperada: ' + recuperados.length + ' dataset' +
        (recuperados.length === 1 ? '' : 's') + ' vuelve' + (recuperados.length === 1 ? '' : 'n') +
        ' a recibir';

  const bloque = (titulo, lista, color) => (lista.length ? `
    <h3 style="color:${color};margin:20px 0 8px;font-size:15px;">${titulo}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${lista.map((d) => `<tr>
        <td style="padding:6px 10px;border:1px solid #ddd;font-family:monospace;">${d.dataset}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${nHoras(d)}</td>
      </tr>`).join('')}
    </table>` : '');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;color:#333;line-height:1.5;">
      <h2 style="color:${rotos.length || recordados.length ? '#b00020' : '#0a7d32'};margin:0 0 4px;">
        ${rotos.length || recordados.length ? 'La réplica del ERP no está recibiendo datos' : 'La réplica del ERP vuelve a recibir datos'}
      </h2>
      <p style="color:#666;font-size:13px;margin:0;">
        Comprobado en altas.gruponord.com el ${new Date().toLocaleString('es-ES')}
      </p>
      ${bloque('Sin datos frescos', rotos, '#b00020')}
      ${bloque('Siguen sin datos frescos', recordados, '#b00020')}
      ${bloque('Recuperados', recuperados, '#0a7d32')}
      ${rotos.length || recordados.length ? `
      <p style="margin-top:20px;font-size:13px;">
        Esto lo detecta Altas mirando su propia base de datos, sin preguntar al
        agente: si el aviso ha salido, el dato está viejo, y da igual el motivo.
        Lo primero que hay que comprobar es que el Sincronizador GNP siga vivo en
        <strong>10.0.0.85</strong> (servidor encendido, disco con espacio y el
        timer de systemd disparando).
      </p>` : ''}
      <p style="margin-top:20px;color:#888;font-size:11px;">
        Aviso automático de altas.gruponord.com. Se avisa al detectar la
        incidencia, una vez al día mientras siga abierta, y al recuperarse.
      </p>
    </div>`;

  const texto = [
    rotos.length || recordados.length
      ? 'La replica del ERP no esta recibiendo datos.'
      : 'La replica del ERP vuelve a recibir datos.',
    'Comprobado en altas.gruponord.com el ' + new Date().toLocaleString('es-ES'),
    ...(rotos.length ? ['', 'SIN DATOS FRESCOS:', ...rotos.map((d) => '  ' + d.dataset + ' - ' + nHoras(d))] : []),
    ...(recordados.length ? ['', 'SIGUEN SIN DATOS FRESCOS:', ...recordados.map((d) => '  ' + d.dataset + ' - ' + nHoras(d))] : []),
    ...(recuperados.length ? ['', 'RECUPERADOS:', ...recuperados.map((d) => '  ' + d.dataset + ' - ' + nHoras(d))] : []),
    ...(rotos.length || recordados.length
      ? ['', 'Comprobar que el Sincronizador GNP siga vivo en 10.0.0.85.'] : []),
  ].join('\n');

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: destinatarios.join(', '),
    subject: asunto,
    text: texto,
    html,
  });

  return { asunto, destinatarios };
};

module.exports = {
  enviarEmailSubmission, enviarEmailProspecting, enviarEmailPlv, enviarEmailOferta,
  enviarEmailAlertaSync,
};
