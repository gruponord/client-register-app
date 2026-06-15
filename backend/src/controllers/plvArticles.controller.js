const pool = require('../config/db');

// Listado de articulos, opcionalmente filtrando por empresa y/o solo activos.
const listar = async (req, res) => {
  try {
    const { company_id } = req.query;
    const soloActivos = req.query.active === 'true';
    const condiciones = [];
    const valores = [];
    let idx = 1;
    if (company_id) { condiciones.push(`a.company_id = $${idx++}`); valores.push(company_id); }
    if (soloActivos) { condiciones.push(`a.active = true`); }
    const where = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';

    const result = await pool.query(
      `SELECT a.*,
              c.name AS company_name,
              g.name AS group_name, g.sort_order AS group_sort,
              b.name AS brand_name
       FROM plv_articles a
       LEFT JOIN plv_companies c ON a.company_id = c.id
       LEFT JOIN plv_groups g    ON a.group_id   = g.id
       LEFT JOIN plv_brands b    ON a.brand_id   = b.id
       ${where}
       ORDER BY g.sort_order NULLS LAST, g.name, b.name NULLS FIRST, a.code`,
      valores
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar artículos PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM plv_articles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener artículo PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { company_id, group_id, brand_id, code, description } = req.body;
    const result = await pool.query(
      `INSERT INTO plv_articles (company_id, group_id, brand_id, code, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [company_id, group_id, brand_id || null, code, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un artículo con ese código en esta empresa' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Empresa, grupo o marca no válidos' });
    }
    console.error('Error al crear artículo PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const anterior = await pool.query('SELECT * FROM plv_articles WHERE id = $1', [id]);
    if (anterior.rows.length === 0) {
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }
    req._oldValue = anterior.rows[0];

    const { company_id, group_id, brand_id, code, description, active } = req.body;
    const campos = [];
    const valores = [];
    let idx = 1;
    if (company_id !== undefined)  { campos.push(`company_id = $${idx++}`);  valores.push(company_id); }
    if (group_id !== undefined)    { campos.push(`group_id = $${idx++}`);    valores.push(group_id); }
    if (brand_id !== undefined)    { campos.push(`brand_id = $${idx++}`);    valores.push(brand_id || null); }
    if (code !== undefined)        { campos.push(`code = $${idx++}`);        valores.push(code); }
    if (description !== undefined) { campos.push(`description = $${idx++}`); valores.push(description); }
    if (active !== undefined)      { campos.push(`active = $${idx++}`);      valores.push(active); }
    if (campos.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    campos.push(`updated_at = NOW()`);
    valores.push(id);

    const result = await pool.query(
      `UPDATE plv_articles SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
      valores
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un artículo con ese código en esta empresa' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Empresa, grupo o marca no válidos' });
    }
    console.error('Error al actualizar artículo PLV:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, actualizar };
