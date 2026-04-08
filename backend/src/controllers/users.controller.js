const bcrypt = require('bcrypt');
const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, active, created_at, updated_at FROM users ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, active, created_at, updated_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { username, password, email, full_name, role } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, email, full_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, full_name, role, active, created_at`,
      [username, passwordHash, email || null, full_name || null, role || 'comercial']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener valor anterior para auditoría
    const anterior = await pool.query('SELECT id, username, email, full_name, role, active FROM users WHERE id = $1', [id]);
    if (anterior.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    req._oldValue = anterior.rows[0];

    const { username, email, full_name, role, active } = req.body;
    const campos = [];
    const valores = [];
    let idx = 1;

    if (username !== undefined) { campos.push(`username = $${idx++}`); valores.push(username); }
    if (email !== undefined) { campos.push(`email = $${idx++}`); valores.push(email || null); }
    if (full_name !== undefined) { campos.push(`full_name = $${idx++}`); valores.push(full_name); }
    if (role !== undefined) { campos.push(`role = $${idx++}`); valores.push(role); }
    if (active !== undefined) { campos.push(`active = $${idx++}`); valores.push(active); }
    campos.push(`updated_at = NOW()`);

    if (campos.length === 1) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    valores.push(id);
    const result = await pool.query(
      `UPDATE users SET ${campos.join(', ')} WHERE id = $${idx}
       RETURNING id, username, email, full_name, role, active, updated_at`,
      valores
    );

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, actualizar };
