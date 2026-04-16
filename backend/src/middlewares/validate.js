const { body, query, validationResult } = require('express-validator');

// Middleware para ejecutar las validaciones y devolver errores
const ejecutarValidacion = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Validaciones para login
const validarLogin = [
  body('username').trim().notEmpty().withMessage('El usuario es obligatorio'),
  body('password').notEmpty().withMessage('La contraseña es obligatoria'),
  ejecutarValidacion,
];

// Validaciones para crear usuario
const validarCrearUsuario = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('El usuario debe tener entre 3 y 50 caracteres'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email no válido'),
  body('full_name').optional().trim().isLength({ max: 100 }),
  body('role').isIn(['admin', 'comercial']).withMessage('Rol debe ser admin o comercial'),
  ejecutarValidacion,
];

// Validaciones para editar usuario
const validarEditarUsuario = [
  body('username').optional().trim().isLength({ min: 3, max: 50 }),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email no válido'),
  body('full_name').optional().trim().isLength({ max: 100 }),
  body('role').optional().isIn(['admin', 'comercial']),
  body('active').optional().isBoolean(),
  ejecutarValidacion,
];

// Validaciones para maestros
const validarMaestro = [
  body('code').trim().notEmpty().withMessage('El código es obligatorio').isLength({ max: 20 }),
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 100 }),
  ejecutarValidacion,
];

// Validaciones para submission
const validarSubmission = [
  body('plant_id').isInt({ min: 1 }).withMessage('Planta es obligatoria'),
  body('commercial_id').isInt({ min: 1 }).withMessage('Comercial es obligatorio'),
  body('client_action_id').isInt({ min: 1 }).withMessage('Acción de cliente es obligatoria'),
  body('commercial_name').trim().notEmpty().isLength({ max: 40 }).withMessage('Nombre comercial es obligatorio (máx 40 car.)'),
  body('economic_segmentation').isIn(['A', 'B', 'C', 'D']).withMessage('Segmentación debe ser A, B, C o D'),
  body('business_name').trim().notEmpty().isLength({ max: 40 }).withMessage('Razón social es obligatoria (máx 40 car.)'),
  body('nif_cif').trim().notEmpty().isLength({ max: 20 }).withMessage('NIF/CIF es obligatorio'),
  body('street_address').trim().notEmpty().isLength({ max: 40 }).withMessage('Dirección es obligatoria'),
  body('postal_code').trim().notEmpty().isLength({ max: 10 }).withMessage('Código postal es obligatorio'),
  body('city').trim().notEmpty().isLength({ max: 50 }).withMessage('Población es obligatoria'),
  body('phone').trim().notEmpty().matches(/^[0-9+\s()-]+$/).withMessage('Teléfono no válido'),
  body('contact_email').trim().isEmail().isLength({ max: 40 }).withMessage('Email de contacto no válido'),
  body('billing_email').trim().isEmail().isLength({ max: 40 }).withMessage('Email de facturación no válido'),
  body('client_class_id').isInt({ min: 1 }).withMessage('Clase de cliente es obligatoria'),
  body('billing_type_id').isInt({ min: 1 }).withMessage('Tipo de facturación es obligatorio'),
  body('payment_method_id').isInt({ min: 1 }).withMessage('Forma de pago es obligatoria'),
  body('visit_days').trim().notEmpty().withMessage('Días de visita son obligatorios'),
  body('client_position').trim().notEmpty().isLength({ max: 50 }).withMessage('Posición de cliente es obligatoria'),
  body('visit_period_id').isInt({ min: 1 }).withMessage('Periodo de visita es obligatorio'),
  body('telesales').custom((v) => v === 'true' || v === 'false' || typeof v === 'boolean').withMessage('Televenta es obligatorio'),
  body('barrel_client').custom((v) => v === 'true' || v === 'false' || typeof v === 'boolean').withMessage('Cliente barril es obligatorio'),
  body('delivery_days').trim().notEmpty().withMessage('Días de reparto son obligatorios'),
  body('delivery_time_start').trim().notEmpty().withMessage('Hora inicio reparto es obligatoria'),
  body('delivery_time_end').trim().notEmpty().withMessage('Hora fin reparto es obligatoria'),
  body('rest_days').trim().notEmpty().withMessage('Días de descanso son obligatorios'),
  body('morning_order').custom((v) => v === 'true' || v === 'false' || typeof v === 'boolean').withMessage('Pedido mañana es obligatorio'),
  ejecutarValidacion,
];

// Helper: valida que un campo sea un array (o JSON string parseable a array) con al menos min elementos
const esArrayValido = (valor, min = 1) => {
  let arr = valor;
  if (typeof valor === 'string') {
    try { arr = JSON.parse(valor); } catch { return false; }
  }
  return Array.isArray(arr) && arr.length >= min;
};

// Validaciones para prospección de cliente de cerveza
const validarProspecting = [
  body('plant_id').isInt({ min: 1 }).withMessage('Planta es obligatoria'),
  body('client_code').optional({ values: 'falsy' }).trim().isLength({ max: 10 }).withMessage('Código de cliente máx 10 car.'),
  body('client_name').trim().notEmpty().isLength({ max: 40 }).withMessage('Nombre del cliente es obligatorio (máx 40 car.)'),
  body('address').trim().notEmpty().isLength({ max: 40 }).withMessage('Dirección es obligatoria (máx 40 car.)'),
  body('contact_person').trim().notEmpty().isLength({ max: 40 }).withMessage('Persona de contacto es obligatoria (máx 40 car.)'),
  body('contact_phone').trim().notEmpty().isLength({ max: 40 }).withMessage('Teléfono contacto es obligatorio (máx 40 car.)'),
  body('call_schedule').trim().notEmpty().isLength({ max: 40 }).withMessage('Horario llamar es obligatorio (máx 40 car.)'),
  body('current_brands').custom((v) => esArrayValido(v)).withMessage('Marcas actuales es obligatorio'),
  body('contract_type_id').isInt({ min: 1 }).withMessage('Tipo de contrato es obligatorio'),
  body('barrel_volume_id').isInt({ min: 1 }).withMessage('Volumen de barril es obligatorio'),
  body('barrel_discount_type_id').isInt({ min: 1 }).withMessage('Tipo de descuento es obligatorio'),
  body('service_rating').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('Valoración debe ser de 1 a 5'),
  body('improvement_points').custom((v) => esArrayValido(v)).withMessage('Puntos de mejora es obligatorio'),
  body('interest_brands').custom((v) => esArrayValido(v)).withMessage('Marcas de interés es obligatorio'),
  body('proposal_priorities').custom((v) => esArrayValido(v)).withMessage('Prioridades de propuesta es obligatorio'),
  body('notes').optional({ values: 'falsy' }).trim(),
  body('other_brands_text').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  ejecutarValidacion,
];

// Validaciones para filtros de auditoría
const validarFiltrosAuditoria = [
  query('user_id').optional().isInt(),
  query('action').optional().trim(),
  query('entity').optional().trim(),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  ejecutarValidacion,
];

module.exports = {
  validarLogin,
  validarCrearUsuario,
  validarEditarUsuario,
  validarMaestro,
  validarSubmission,
  validarProspecting,
  validarFiltrosAuditoria,
  ejecutarValidacion,
};
