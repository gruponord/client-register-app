const pool = require('../config/db');
const { moverFicheros } = require('../services/file.service');
const { enviarEmailSubmission } = require('../services/email.service');
const { registrarAuditoria } = require('../middlewares/audit');

const listar = async (req, res) => {
  try {
    const { plant_id, commercial_id, from, to, page = 1, limit = 20 } = req.query;
    const condiciones = [];
    const valores = [];
    let idx = 1;

    if (plant_id) { condiciones.push(`s.plant_id = $${idx++}`); valores.push(plant_id); }
    if (commercial_id) { condiciones.push(`s.commercial_id = $${idx++}`); valores.push(commercial_id); }
    if (from) { condiciones.push(`s.created_at >= $${idx++}`); valores.push(from); }
    if (to) { condiciones.push(`s.created_at <= $${idx++}`); valores.push(to + 'T23:59:59Z'); }

    const where = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM submissions s ${where}`, valores
    );
    const total = parseInt(countResult.rows[0].count);

    valores.push(parseInt(limit));
    valores.push(offset);

    const result = await pool.query(
      `SELECT s.*, p.name as plant_name, c.name as commercial_name_master, u.full_name as user_name
       FROM submissions s
       LEFT JOIN plants p ON s.plant_id = p.id
       LEFT JOIN commercials c ON s.commercial_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      valores
    );

    res.json({
      data: result.rows,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error('Error al listar submissions:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, p.name as plant_name, p.code as plant_code,
              c.name as commercial_name_master, ca.name as client_action_name,
              cc.name as client_class_name, bt.name as billing_type_name,
              pm.name as payment_method_name, vp.name as visit_period_name,
              u.full_name as user_name
       FROM submissions s
       LEFT JOIN plants p ON s.plant_id = p.id
       LEFT JOIN commercials c ON s.commercial_id = c.id
       LEFT JOIN client_actions ca ON s.client_action_id = ca.id
       LEFT JOIN client_classes cc ON s.client_class_id = cc.id
       LEFT JOIN billing_types bt ON s.billing_type_id = bt.id
       LEFT JOIN payment_methods pm ON s.payment_method_id = pm.id
       LEFT JOIN visit_periods vp ON s.visit_period_id = vp.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission no encontrada' });
    }

    const archivos = await pool.query(
      'SELECT * FROM submission_files WHERE submission_id = $1 ORDER BY id',
      [req.params.id]
    );

    res.json({ ...result.rows[0], files: archivos.rows });
  } catch (err) {
    console.error('Error al obtener submission:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crear = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      plant_id, commercial_id, client_action_id, client_code, group_code,
      previous_code, point_of_sale, commercial_name, economic_segmentation,
      business_name, nif_cif, street_address, postal_code, city, phone,
      contact_email, billing_email, client_class_id, billing_type_id,
      payment_method_id, visit_days, client_position, visit_period_id,
      telesales, barrel_client, delivery_days, delivery_time_start,
      delivery_time_end, rest_days, morning_order, observations,
    } = req.body;

    const toBool = (v) => v === 'true' || v === true;

    const result = await client.query(
      `INSERT INTO submissions (
        user_id, plant_id, commercial_id, client_action_id, client_code, group_code,
        previous_code, point_of_sale, commercial_name, economic_segmentation,
        business_name, nif_cif, street_address, postal_code, city, phone,
        contact_email, billing_email, client_class_id, billing_type_id,
        payment_method_id, visit_days, client_position, visit_period_id,
        telesales, barrel_client, delivery_days, delivery_time_start,
        delivery_time_end, rest_days, morning_order, observations
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
      ) RETURNING *`,
      [
        req.usuario.id, plant_id, commercial_id, client_action_id,
        client_code || null, group_code || null, previous_code || null,
        point_of_sale || null, commercial_name, economic_segmentation,
        business_name, nif_cif, street_address, postal_code, city, phone,
        contact_email, billing_email, client_class_id, billing_type_id,
        payment_method_id, visit_days, client_position, visit_period_id,
        toBool(telesales), toBool(barrel_client), delivery_days,
        delivery_time_start, delivery_time_end, rest_days, toBool(morning_order),
        observations || null,
      ]
    );

    const submission = result.rows[0];

    // Mover ficheros si existen
    let archivosBD = [];
    if (req.files && req.files.length > 0) {
      const archivos = await moverFicheros(req.files, submission.id);
      for (const archivo of archivos) {
        const fileResult = await client.query(
          `INSERT INTO submission_files (submission_id, original_name, stored_path, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [submission.id, archivo.original_name, archivo.stored_path, archivo.mime_type, archivo.size_bytes]
        );
        archivosBD.push(fileResult.rows[0]);
      }
    }

    await client.query('COMMIT');

    // Auditoría
    await registrarAuditoria({
      userId: req.usuario.id,
      action: 'crear',
      entity: 'submissions',
      entityId: submission.id,
      oldValue: null,
      newValue: submission,
      ip: req.ip,
    });

    // Obtener datos para email
    const plantaResult = await pool.query('SELECT name FROM plants WHERE id = $1', [plant_id]);
    const emailsResult = await pool.query('SELECT email FROM plant_emails WHERE plant_id = $1', [plant_id]);
    const commercialResult = await pool.query('SELECT name FROM commercials WHERE id = $1', [commercial_id]);
    const actionResult = await pool.query('SELECT name FROM client_actions WHERE id = $1', [client_action_id]);
    const classResult = await pool.query('SELECT name FROM client_classes WHERE id = $1', [client_class_id]);
    const billingResult = await pool.query('SELECT name FROM billing_types WHERE id = $1', [billing_type_id]);
    const paymentResult = await pool.query('SELECT name FROM payment_methods WHERE id = $1', [payment_method_id]);
    const periodResult = await pool.query('SELECT name FROM visit_periods WHERE id = $1', [visit_period_id]);

    const emailsPlanta = emailsResult.rows.map(r => r.email);

    if (emailsPlanta.length > 0) {
      enviarEmailSubmission({
        submission: {
          ...submission,
          commercial_name_master: commercialResult.rows[0]?.name,
          client_action_name: actionResult.rows[0]?.name,
          client_class_name: classResult.rows[0]?.name,
          billing_type_name: billingResult.rows[0]?.name,
          payment_method_name: paymentResult.rows[0]?.name,
          visit_period_name: periodResult.rows[0]?.name,
        },
        plantaNombre: plantaResult.rows[0]?.name || '',
        archivos: archivosBD,
        emailsPlanta,
        emailUsuario: req.usuario.email,
      }).catch(err => console.error('Error enviando email:', err));
    }

    res.status(201).json({ ...submission, files: archivosBD });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear submission:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

module.exports = { listar, obtener, crear };
