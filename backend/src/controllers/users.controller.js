const bcrypt = require('bcrypt');
const pool = require('../config/db');

// Devuelve el array de ids de empresas PLV asignadas al usuario.
const obtenerEmpresasPlv = async (client, userId) => {
  const r = await client.query(
    'SELECT company_id FROM plv_user_companies WHERE user_id = $1 ORDER BY company_id',
    [userId]
  );
  return r.rows.map((row) => row.company_id);
};

// Sustituye el conjunto de empresas PLV asignadas a un usuario.
const reemplazarEmpresasPlv = async (client, userId, ids) => {
  await client.query('DELETE FROM plv_user_companies WHERE user_id = $1', [userId]);
  if (!Array.isArray(ids) || ids.length === 0) return;
  for (const cid of ids) {
    await client.query(
      'INSERT INTO plv_user_companies (user_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, cid]
    );
  }
};

const listar = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.active, u.utilities,
             u.created_at, u.updated_at,
             COALESCE(
               (SELECT json_agg(uc.company_id ORDER BY uc.company_id)
                FROM plv_user_companies uc WHERE uc.user_id = u.id),
               '[]'::json
             ) AS plv_company_ids
      FROM users u
      ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, active, utilities, created_at, updated_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const plvIds = await obtenerEmpresasPlv(pool, req.params.id);
    res.json({ ...result.rows[0], plv_company_ids: plvIds });
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crear = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { username, password, email, full_name, role, utilities, plv_company_ids } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const utilitiesArr = Array.isArray(utilities) ? utilities : [];

    const result = await client.query(
      `INSERT INTO users (username, password_hash, email, full_name, role, utilities)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, full_name, role, active, utilities, created_at`,
      [username, passwordHash, email || null, full_name || null, role || 'comercial', JSON.stringify(utilitiesArr)]
    );
    const usuario = result.rows[0];

    // Solo guardamos asignaciones si tiene la utilidad 'plv'; si no, las ignoramos.
    if (utilitiesArr.includes('plv') && Array.isArray(plv_company_ids)) {
      await reemplazarEmpresasPlv(client, usuario.id, plv_company_ids);
    }
    await client.query('COMMIT');

    const plvIds = await obtenerEmpresasPlv(pool, usuario.id);
    res.status(201).json({ ...usuario, plv_company_ids: plvIds });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

const actualizar = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const anterior = await client.query(
      'SELECT id, username, email, full_name, role, active, utilities FROM users WHERE id = $1',
      [id]
    );
    if (anterior.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    req._oldValue = anterior.rows[0];

    const { username, email, full_name, role, active, utilities, plv_company_ids } = req.body;
    const campos = [];
    const valores = [];
    let idx = 1;

    if (username !== undefined) { campos.push(`username = $${idx++}`); valores.push(username); }
    if (email !== undefined) { campos.push(`email = $${idx++}`); valores.push(email || null); }
    if (full_name !== undefined) { campos.push(`full_name = $${idx++}`); valores.push(full_name); }
    if (role !== undefined) { campos.push(`role = $${idx++}`); valores.push(role); }
    if (active !== undefined) { campos.push(`active = $${idx++}`); valores.push(active); }
    if (utilities !== undefined) { campos.push(`utilities = $${idx++}`); valores.push(JSON.stringify(utilities)); }

    // Si hay al menos un campo de cabecera, hacemos UPDATE; si no, evitamos query
    // pero seguimos aplicando empresas si vienen.
    let usuario = null;
    if (campos.length > 0) {
      campos.push(`updated_at = NOW()`);
      valores.push(id);
      const result = await client.query(
        `UPDATE users SET ${campos.join(', ')} WHERE id = $${idx}
         RETURNING id, username, email, full_name, role, active, utilities, updated_at`,
        valores
      );
      usuario = result.rows[0];
    } else {
      usuario = anterior.rows[0];
    }

    // Reflejar asignaciones PLV solo si vienen explicitamente.
    if (plv_company_ids !== undefined) {
      // Si el usuario pierde la utilidad 'plv', limpiamos las asignaciones.
      const tienePlv = Array.isArray(usuario.utilities)
        ? usuario.utilities.includes('plv')
        : (Array.isArray(utilities) && utilities.includes('plv'));
      if (tienePlv) {
        await reemplazarEmpresasPlv(client, id, plv_company_ids);
      } else {
        await reemplazarEmpresasPlv(client, id, []);
      }
    }

    await client.query('COMMIT');
    const plvIds = await obtenerEmpresasPlv(pool, id);
    res.json({ ...usuario, plv_company_ids: plvIds });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

module.exports = { listar, obtener, crear, actualizar };
