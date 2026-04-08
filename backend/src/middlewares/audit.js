const pool = require('../config/db');

/**
 * Registra una entrada en audit_log
 */
const registrarAuditoria = async ({ userId, action, entity, entityId, oldValue, newValue, ip }) => {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, old_value, new_value, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, entity, entityId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, ip]
    );
  } catch (err) {
    console.error('Error al registrar auditoría:', err);
  }
};

/**
 * Middleware que auto-registra operaciones CRUD
 */
const auditMiddleware = (entity) => {
  return (req, res, next) => {
    // Guardar referencia al método original de json
    const originalJson = res.json.bind(res);

    res.json = (data) => {
      // Solo auditar si la respuesta fue exitosa
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.usuario ? req.usuario.id : null;
        const ip = req.ip || req.connection?.remoteAddress;
        let action = '';

        switch (req.method) {
          case 'POST':
            action = 'crear';
            break;
          case 'PUT':
          case 'PATCH':
            action = 'actualizar';
            break;
          case 'DELETE':
            action = 'eliminar';
            break;
          default:
            // No auditar GETs
            return originalJson(data);
        }

        const entityId = req.params.id || data?.id;
        registrarAuditoria({
          userId,
          action,
          entity,
          entityId,
          oldValue: req._oldValue || null,
          newValue: data,
          ip,
        });
      }

      return originalJson(data);
    };

    next();
  };
};

module.exports = { auditMiddleware, registrarAuditoria };
