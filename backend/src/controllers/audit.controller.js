const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const { user_id, action, entity, from, to, page = 1, limit = 50 } = req.query;
    const condiciones = [];
    const valores = [];
    let idx = 1;

    if (user_id) { condiciones.push(`a.user_id = $${idx++}`); valores.push(user_id); }
    if (action) { condiciones.push(`a.action = $${idx++}`); valores.push(action); }
    if (entity) { condiciones.push(`a.entity = $${idx++}`); valores.push(entity); }
    if (from) { condiciones.push(`a.created_at >= $${idx++}`); valores.push(from); }
    if (to) { condiciones.push(`a.created_at <= $${idx++}`); valores.push(to + 'T23:59:59Z'); }

    const where = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM audit_log a ${where}`, valores
    );
    const total = parseInt(countResult.rows[0].count);

    valores.push(parseInt(limit));
    valores.push(offset);

    const result = await pool.query(
      `SELECT a.*, u.full_name as user_name, u.username
       FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       ${where}
       ORDER BY a.created_at DESC
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
    console.error('Error al listar auditoría:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar };
