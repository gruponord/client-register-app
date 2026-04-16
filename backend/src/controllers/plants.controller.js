const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const soloActivos = req.query.active === 'true';
    const where = soloActivos ? 'WHERE active = true' : '';
    const result = await pool.query(`SELECT * FROM plants ${where} ORDER BY name`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar plantas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM plants WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Planta no encontrada' });
    }

    const emails = await pool.query('SELECT * FROM plant_emails WHERE plant_id = $1 ORDER BY id', [req.params.id]);
    const prospectingEmails = await pool.query('SELECT * FROM plant_prospecting_emails WHERE plant_id = $1 ORDER BY id', [req.params.id]);
    res.json({ ...result.rows[0], emails: emails.rows, prospecting_emails: prospectingEmails.rows });
  } catch (err) {
    console.error('Error al obtener planta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { code, name } = req.body;
    const result = await pool.query(
      'INSERT INTO plants (code, name) VALUES ($1, $2) RETURNING *',
      [code, name]
    );
    res.status(201).json({ ...result.rows[0], emails: [] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código de planta ya existe' });
    }
    console.error('Error al crear planta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;

    const anterior = await pool.query('SELECT * FROM plants WHERE id = $1', [id]);
    if (anterior.rows.length === 0) {
      return res.status(404).json({ error: 'Planta no encontrada' });
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

    valores.push(id);
    const result = await pool.query(
      `UPDATE plants SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
      valores
    );

    const emails = await pool.query('SELECT * FROM plant_emails WHERE plant_id = $1 ORDER BY id', [id]);
    res.json({ ...result.rows[0], emails: emails.rows });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código de planta ya existe' });
    }
    console.error('Error al actualizar planta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Gestión de emails de planta
const listarEmails = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM plant_emails WHERE plant_id = $1 ORDER BY id', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar emails:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const agregarEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query(
      'INSERT INTO plant_emails (plant_id, email) VALUES ($1, $2) RETURNING *',
      [req.params.id, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este email ya está asignado a esta planta' });
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Planta no encontrada' });
    }
    console.error('Error al agregar email:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const eliminarEmail = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM plant_emails WHERE id = $1 AND plant_id = $2 RETURNING *',
      [req.params.emailId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email no encontrado' });
    }
    res.json({ message: 'Email eliminado', id: parseInt(req.params.emailId) });
  } catch (err) {
    console.error('Error al eliminar email:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Gestión de emails de prospección
const listarEmailsProspecting = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM plant_prospecting_emails WHERE plant_id = $1 ORDER BY id', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar emails de prospección:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const agregarEmailProspecting = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query(
      'INSERT INTO plant_prospecting_emails (plant_id, email) VALUES ($1, $2) RETURNING *',
      [req.params.id, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este email ya está asignado a esta planta para prospección' });
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Planta no encontrada' });
    }
    console.error('Error al agregar email de prospección:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const eliminarEmailProspecting = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM plant_prospecting_emails WHERE id = $1 AND plant_id = $2 RETURNING *',
      [req.params.emailId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email no encontrado' });
    }
    res.json({ message: 'Email eliminado', id: parseInt(req.params.emailId) });
  } catch (err) {
    console.error('Error al eliminar email de prospección:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  listar, obtener, crear, actualizar,
  listarEmails, agregarEmail, eliminarEmail,
  listarEmailsProspecting, agregarEmailProspecting, eliminarEmailProspecting,
};
