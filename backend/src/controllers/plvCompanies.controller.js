const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const soloActivos = req.query.active === 'true';
    const where = soloActivos ? 'WHERE active = true' : '';
    const result = await pool.query(`SELECT * FROM plv_companies ${where} ORDER BY name`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar empresas PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM plv_companies WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa PLV no encontrada' });
    }
    const emails = await pool.query('SELECT * FROM plv_company_emails WHERE company_id = $1 ORDER BY id', [req.params.id]);
    res.json({ ...result.rows[0], emails: emails.rows });
  } catch (err) {
    console.error('Error al obtener empresa PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { code, name } = req.body;
    const result = await pool.query(
      'INSERT INTO plv_companies (code, name) VALUES ($1, $2) RETURNING *',
      [code, name]
    );
    res.status(201).json({ ...result.rows[0], emails: [] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código ya existe' });
    }
    console.error('Error al crear empresa PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const anterior = await pool.query('SELECT * FROM plv_companies WHERE id = $1', [id]);
    if (anterior.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa PLV no encontrada' });
    }
    req._oldValue = anterior.rows[0];

    const { code, name, active } = req.body;
    const campos = [];
    const valores = [];
    let idx = 1;
    if (code !== undefined) { campos.push(`code = $${idx++}`); valores.push(code); }
    if (name !== undefined) { campos.push(`name = $${idx++}`); valores.push(name); }
    if (active !== undefined) { campos.push(`active = $${idx++}`); valores.push(active); }
    if (campos.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    campos.push(`updated_at = NOW()`);

    valores.push(id);
    const result = await pool.query(
      `UPDATE plv_companies SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
      valores
    );
    const emails = await pool.query('SELECT * FROM plv_company_emails WHERE company_id = $1 ORDER BY id', [id]);
    res.json({ ...result.rows[0], emails: emails.rows });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código ya existe' });
    }
    console.error('Error al actualizar empresa PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const listarEmails = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM plv_company_emails WHERE company_id = $1 ORDER BY id', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar emails PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const agregarEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query(
      'INSERT INTO plv_company_emails (company_id, email) VALUES ($1, $2) RETURNING *',
      [req.params.id, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este email ya está asignado a esta empresa' });
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Empresa PLV no encontrada' });
    }
    console.error('Error al agregar email PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const eliminarEmail = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM plv_company_emails WHERE id = $1 AND company_id = $2 RETURNING *',
      [req.params.emailId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email no encontrado' });
    }
    res.json({ message: 'Email eliminado', id: parseInt(req.params.emailId) });
  } catch (err) {
    console.error('Error al eliminar email PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, actualizar, listarEmails, agregarEmail, eliminarEmail };
