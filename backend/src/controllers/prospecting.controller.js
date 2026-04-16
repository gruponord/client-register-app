const pool = require('../config/db');
const { moverFicherosProspecting } = require('../services/file.service');
const { enviarEmailProspecting } = require('../services/email.service');
const { registrarAuditoria } = require('../middlewares/audit');

const listar = async (req, res) => {
  try {
    const { plant_id, from, to, page = 1, limit = 20 } = req.query;
    const condiciones = [];
    const valores = [];
    let idx = 1;

    if (plant_id) { condiciones.push(`ps.plant_id = $${idx++}`); valores.push(plant_id); }
    if (from) { condiciones.push(`ps.created_at >= $${idx++}`); valores.push(from); }
    if (to) { condiciones.push(`ps.created_at <= $${idx++}`); valores.push(to + 'T23:59:59Z'); }

    const where = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM prospecting_submissions ps ${where}`, valores
    );
    const total = parseInt(countResult.rows[0].count);

    valores.push(parseInt(limit));
    valores.push(offset);

    const result = await pool.query(
      `SELECT ps.*, p.name as plant_name, u.full_name as user_name
       FROM prospecting_submissions ps
       LEFT JOIN plants p ON ps.plant_id = p.id
       LEFT JOIN users u ON ps.user_id = u.id
       ${where}
       ORDER BY ps.created_at DESC
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
    console.error('Error al listar prospecciones:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ps.*, p.name as plant_name, p.code as plant_code,
              ct.name as contract_type_name,
              bv.name as barrel_volume_name,
              bdt.name as barrel_discount_type_name,
              u.full_name as user_name
       FROM prospecting_submissions ps
       LEFT JOIN plants p ON ps.plant_id = p.id
       LEFT JOIN contract_types ct ON ps.contract_type_id = ct.id
       LEFT JOIN barrel_volumes bv ON ps.barrel_volume_id = bv.id
       LEFT JOIN barrel_discount_types bdt ON ps.barrel_discount_type_id = bdt.id
       LEFT JOIN users u ON ps.user_id = u.id
       WHERE ps.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prospección no encontrada' });
    }

    // Resolver nombres de maestros en campos JSONB
    const submission = result.rows[0];

    // Resolver marcas actuales
    if (submission.current_brands && submission.current_brands.length > 0) {
      const brandsResult = await pool.query(
        'SELECT id, name FROM beer_brands WHERE id = ANY($1)',
        [submission.current_brands]
      );
      submission.current_brands_names = brandsResult.rows;
    }

    // Resolver puntos de mejora
    if (submission.improvement_points && submission.improvement_points.length > 0) {
      const impResult = await pool.query(
        'SELECT id, name FROM improvement_points WHERE id = ANY($1)',
        [submission.improvement_points]
      );
      submission.improvement_points_names = impResult.rows;
    }

    // Resolver marcas de interés
    if (submission.interest_brands && submission.interest_brands.length > 0) {
      const intResult = await pool.query(
        'SELECT id, name FROM interest_brands WHERE id = ANY($1)',
        [submission.interest_brands]
      );
      submission.interest_brands_names = intResult.rows;
    }

    // Resolver prioridades
    if (submission.proposal_priorities && submission.proposal_priorities.length > 0) {
      const priResult = await pool.query(
        'SELECT id, name FROM proposal_priorities WHERE id = ANY($1)',
        [submission.proposal_priorities]
      );
      submission.proposal_priorities_names = priResult.rows;
    }

    // Ficheros
    const archivos = await pool.query(
      'SELECT * FROM prospecting_files WHERE prospecting_id = $1 ORDER BY id',
      [req.params.id]
    );
    submission.files = archivos.rows;

    res.json(submission);
  } catch (err) {
    console.error('Error al obtener prospección:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crear = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      plant_id, client_code, client_name, address, contact_person,
      contact_phone, call_schedule, other_brands_text,
      contract_type_id, barrel_volume_id, barrel_discount_type_id,
      service_rating, notes,
    } = req.body;

    // Parsear arrays que pueden llegar como JSON string (desde FormData)
    const parseArray = (val) => {
      if (Array.isArray(val)) return val.map(Number);
      if (typeof val === 'string') {
        try { return JSON.parse(val).map(Number); } catch { return []; }
      }
      return [];
    };

    const current_brands = parseArray(req.body.current_brands);
    const improvement_points = parseArray(req.body.improvement_points);
    const interest_brands = parseArray(req.body.interest_brands);
    const proposal_priorities = parseArray(req.body.proposal_priorities);

    const result = await client.query(
      `INSERT INTO prospecting_submissions (
        user_id, plant_id, client_code, client_name, address, contact_person,
        contact_phone, call_schedule, current_brands, other_brands_text,
        contract_type_id, barrel_volume_id, barrel_discount_type_id,
        service_rating, improvement_points, interest_brands,
        proposal_priorities, notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      ) RETURNING *`,
      [
        req.usuario.id, plant_id, client_code || null, client_name, address,
        contact_person, contact_phone, call_schedule,
        JSON.stringify(current_brands), other_brands_text || null,
        contract_type_id, barrel_volume_id, barrel_discount_type_id,
        service_rating || null, JSON.stringify(improvement_points),
        JSON.stringify(interest_brands), JSON.stringify(proposal_priorities),
        notes || null,
      ]
    );

    const submission = result.rows[0];

    // Mover ficheros si existen
    let archivosBD = [];
    if (req.files && req.files.length > 0) {
      const archivos = await moverFicherosProspecting(req.files, submission.id);
      for (const archivo of archivos) {
        const fileResult = await client.query(
          `INSERT INTO prospecting_files (prospecting_id, original_name, stored_path, mime_type, size_bytes)
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
      entity: 'prospecting_submissions',
      entityId: submission.id,
      oldValue: null,
      newValue: submission,
      ip: req.ip,
    });

    // Obtener datos para email
    const plantaResult = await pool.query('SELECT name FROM plants WHERE id = $1', [plant_id]);
    const emailsResult = await pool.query('SELECT email FROM plant_prospecting_emails WHERE plant_id = $1', [plant_id]);

    // Resolver nombres de maestros para el email
    const contractResult = await pool.query('SELECT name FROM contract_types WHERE id = $1', [contract_type_id]);
    const volumeResult = await pool.query('SELECT name FROM barrel_volumes WHERE id = $1', [barrel_volume_id]);
    const discountResult = await pool.query('SELECT name FROM barrel_discount_types WHERE id = $1', [barrel_discount_type_id]);

    // Resolver nombres de arrays JSONB
    const brandsResult = await pool.query('SELECT name FROM beer_brands WHERE id = ANY($1)', [current_brands]);
    const improvResult = await pool.query('SELECT name FROM improvement_points WHERE id = ANY($1)', [improvement_points]);
    const interestResult = await pool.query('SELECT name FROM interest_brands WHERE id = ANY($1)', [interest_brands]);
    const priorityResult = await pool.query('SELECT name FROM proposal_priorities WHERE id = ANY($1)', [proposal_priorities]);

    const emailsPlanta = emailsResult.rows.map(r => r.email);

    if (emailsPlanta.length > 0) {
      enviarEmailProspecting({
        submission: {
          ...submission,
          contract_type_name: contractResult.rows[0]?.name,
          barrel_volume_name: volumeResult.rows[0]?.name,
          barrel_discount_type_name: discountResult.rows[0]?.name,
          current_brands_text: brandsResult.rows.map(r => r.name).join(', '),
          improvement_points_text: improvResult.rows.map(r => r.name).join(', '),
          interest_brands_text: interestResult.rows.map(r => r.name).join(', '),
          proposal_priorities_text: priorityResult.rows.map(r => r.name).join(', '),
        },
        plantaNombre: plantaResult.rows[0]?.name || '',
        archivos: archivosBD,
        emailsPlanta,
        emailUsuario: req.usuario.email,
      }).catch(err => console.error('Error enviando email de prospección:', err));
    }

    res.status(201).json({ ...submission, files: archivosBD });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear prospección:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

module.exports = { listar, obtener, crear };
