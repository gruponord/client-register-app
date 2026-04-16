const pool = require('../config/db');

// Tablas maestras permitidas
const TABLAS_PERMITIDAS = [
  'commercials',
  'client_actions',
  'client_classes',
  'billing_types',
  'payment_methods',
  'visit_periods',
  'beer_brands',
  'contract_types',
  'barrel_volumes',
  'barrel_discount_types',
  'improvement_points',
  'interest_brands',
  'proposal_priorities',
];

const validarTabla = (tabla) => {
  if (!TABLAS_PERMITIDAS.includes(tabla)) {
    return false;
  }
  return true;
};

const listar = async (req, res) => {
  try {
    const { tabla } = req.params;
    if (!validarTabla(tabla)) {
      return res.status(400).json({ error: 'Tabla maestra no válida' });
    }

    const soloActivos = req.query.active === 'true';
    const where = soloActivos ? 'WHERE active = true' : '';
    const result = await pool.query(`SELECT * FROM ${tabla} ${where} ORDER BY name`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar maestro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { tabla, id } = req.params;
    if (!validarTabla(tabla)) {
      return res.status(400).json({ error: 'Tabla maestra no válida' });
    }

    const result = await pool.query(`SELECT * FROM ${tabla} WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener maestro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { tabla } = req.params;
    if (!validarTabla(tabla)) {
      return res.status(400).json({ error: 'Tabla maestra no válida' });
    }

    const { code, name } = req.body;
    const result = await pool.query(
      `INSERT INTO ${tabla} (code, name) VALUES ($1, $2) RETURNING *`,
      [code, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código ya existe' });
    }
    console.error('Error al crear maestro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { tabla, id } = req.params;
    if (!validarTabla(tabla)) {
      return res.status(400).json({ error: 'Tabla maestra no válida' });
    }

    // Valor anterior para auditoría
    const anterior = await pool.query(`SELECT * FROM ${tabla} WHERE id = $1`, [id]);
    if (anterior.rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
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
      `UPDATE ${tabla} SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
      valores
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código ya existe' });
    }
    console.error('Error al actualizar maestro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, actualizar };
