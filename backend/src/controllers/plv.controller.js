const pool = require('../config/db');
const { enviarEmailPlv } = require('../services/email.service');
const { registrarAuditoria } = require('../middlewares/audit');

// Listar peticiones PLV (paginado, solo admin). Filtros por empresa y rango.
const listar = async (req, res) => {
  try {
    const { company_id, from, to, page = 1, limit = 20 } = req.query;
    const condiciones = [];
    const valores = [];
    let idx = 1;

    if (company_id) { condiciones.push(`ps.company_id = $${idx++}`); valores.push(company_id); }
    if (from) { condiciones.push(`ps.created_at >= $${idx++}`); valores.push(from); }
    if (to) { condiciones.push(`ps.created_at <= $${idx++}`); valores.push(to + 'T23:59:59Z'); }

    const where = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM plv_submissions ps ${where}`, valores
    );
    const total = parseInt(countResult.rows[0].count);

    valores.push(parseInt(limit));
    valores.push(offset);

    const result = await pool.query(
      `SELECT ps.*, c.name AS company_name, u.full_name AS user_name
       FROM plv_submissions ps
       LEFT JOIN plv_companies c ON ps.company_id = c.id
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
    console.error('Error al listar peticiones PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Detalle de peticion: cabecera + lineas con datos del articulo resueltos.
const obtener = async (req, res) => {
  try {
    const cabRes = await pool.query(
      `SELECT ps.*, c.name AS company_name, c.code AS company_code, u.full_name AS user_name
       FROM plv_submissions ps
       LEFT JOIN plv_companies c ON ps.company_id = c.id
       LEFT JOIN users u ON ps.user_id = u.id
       WHERE ps.id = $1`,
      [req.params.id]
    );
    if (cabRes.rows.length === 0) {
      return res.status(404).json({ error: 'Petición no encontrada' });
    }

    const lineasRes = await pool.query(
      `SELECT psl.*,
              a.code AS article_code, a.description AS article_description,
              g.name AS group_name, g.sort_order AS group_sort,
              b.name AS brand_name
       FROM plv_submission_lines psl
       LEFT JOIN plv_articles a ON psl.article_id = a.id
       LEFT JOIN plv_groups g ON a.group_id = g.id
       LEFT JOIN plv_brands b ON a.brand_id = b.id
       WHERE psl.submission_id = $1
       ORDER BY g.sort_order NULLS LAST, g.name, b.name NULLS FIRST, a.code`,
      [req.params.id]
    );

    res.json({ ...cabRes.rows[0], lines: lineasRes.rows });
  } catch (err) {
    console.error('Error al obtener petición PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Crear peticion PLV. El cuerpo viene como JSON (sin multipart):
//   { company_id, client_code, client_name, request_date, notes, lines: [{ article_id, units, delivery_date, return_date }] }
const crear = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { company_id, client_code, client_name, request_date, notes } = req.body;
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];

    if (lines.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Debes pedir al menos un artículo (unidades > 0).' });
    }

    // Comprobar que el usuario (no admin) tiene esa empresa asignada.
    if (req.usuario.role !== 'admin') {
      const asignRes = await client.query(
        'SELECT 1 FROM plv_user_companies WHERE user_id = $1 AND company_id = $2',
        [req.usuario.id, company_id]
      );
      if (asignRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No tienes asignada esta empresa PLV.' });
      }
    }

    // Comprobar que todos los articulos pedidos pertenecen a esa empresa y estan activos.
    const articleIds = lines.map((l) => parseInt(l.article_id)).filter(Boolean);
    if (articleIds.length !== lines.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Líneas inválidas.' });
    }
    const articulosRes = await client.query(
      `SELECT id, company_id, active FROM plv_articles WHERE id = ANY($1)`,
      [articleIds]
    );
    const mapaArt = {};
    articulosRes.rows.forEach((a) => { mapaArt[a.id] = a; });
    for (const l of lines) {
      const a = mapaArt[l.article_id];
      if (!a) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Artículo ${l.article_id} no existe.` });
      }
      if (a.company_id !== parseInt(company_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Algún artículo no pertenece a la empresa elegida.' });
      }
    }

    const cabRes = await client.query(
      `INSERT INTO plv_submissions (user_id, company_id, client_code, client_name, request_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.usuario.id, company_id, client_code, client_name, request_date, notes || null]
    );
    const submission = cabRes.rows[0];

    const lineasGuardadas = [];
    for (const l of lines) {
      const units = parseInt(l.units);
      if (!units || units <= 0) continue; // ignoramos ceros por si llegan
      const lr = await client.query(
        `INSERT INTO plv_submission_lines (submission_id, article_id, units, delivery_date, return_date)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [submission.id, l.article_id, units, l.delivery_date || null, l.return_date || null]
      );
      lineasGuardadas.push(lr.rows[0]);
    }

    if (lineasGuardadas.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Debes pedir al menos un artículo con unidades > 0.' });
    }

    await client.query('COMMIT');

    await registrarAuditoria({
      userId: req.usuario.id,
      action: 'crear',
      entity: 'plv_submissions',
      entityId: submission.id,
      oldValue: null,
      newValue: { ...submission, lines: lineasGuardadas },
      ip: req.ip,
    });

    // Datos para email: lineas con descripcion, grupo, marca resueltos.
    const lineasEmailRes = await pool.query(
      `SELECT psl.units, psl.delivery_date, psl.return_date,
              a.code AS article_code, a.description AS article_description,
              g.name AS group_name, g.sort_order AS group_sort,
              b.name AS brand_name
       FROM plv_submission_lines psl
       LEFT JOIN plv_articles a ON psl.article_id = a.id
       LEFT JOIN plv_groups g ON a.group_id = g.id
       LEFT JOIN plv_brands b ON a.brand_id = b.id
       WHERE psl.submission_id = $1
       ORDER BY g.sort_order NULLS LAST, g.name, b.name NULLS FIRST, a.code`,
      [submission.id]
    );
    const empresaRes = await pool.query('SELECT name FROM plv_companies WHERE id = $1', [company_id]);
    const emailsRes  = await pool.query('SELECT email FROM plv_company_emails WHERE company_id = $1', [company_id]);
    const emailsEmpresa = emailsRes.rows.map((r) => r.email);

    if (emailsEmpresa.length > 0) {
      enviarEmailPlv({
        submission: {
          ...submission,
          company_name: empresaRes.rows[0]?.name || '',
          lines: lineasEmailRes.rows,
        },
        emailsEmpresa,
        emailUsuario: req.usuario.email,
      }).catch((err) => console.error('Error enviando email PLV:', err));
    }

    res.status(201).json({ ...submission, lines: lineasGuardadas });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear petición PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

module.exports = { listar, obtener, crear };
