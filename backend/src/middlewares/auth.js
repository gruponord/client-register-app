const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Verificar token JWT
const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Verificar rol admin
const soloAdmin = (req, res, next) => {
  if (req.usuario.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol administrador' });
  }
  next();
};

// Comprueba que el usuario tenga la utilidad indicada en su columna `utilities`.
// El rol admin la ignora (siempre puede). Consulta a BD para no depender de
// lo que llevara el JWT cuando se firmo (asi un cambio del admin se aplica al
// siguiente request).
const requiereUtilidad = (codigo) => async (req, res, next) => {
  if (req.usuario.role === 'admin') return next();
  try {
    const result = await pool.query('SELECT utilities FROM users WHERE id = $1', [req.usuario.id]);
    const utilidades = result.rows[0]?.utilities || [];
    if (!utilidades.includes(codigo)) {
      return res.status(403).json({ error: 'No tienes permiso para usar esta utilidad' });
    }
    next();
  } catch (err) {
    console.error('Error comprobando utilidad:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { verificarToken, soloAdmin, requiereUtilidad };
