const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { verificarToken, soloAdmin, requiereUtilidad } = require('../middlewares/auth');
const { validarPlv } = require('../middlewares/validate');
const ctrl = require('../controllers/plv.controller');

const router = Router();

const limiteCrear = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas solicitudes, intente de nuevo más tarde' },
});

// Crear petición PLV (autenticado + utilidad 'plv'; admins pasan)
router.post('/', verificarToken, requiereUtilidad('plv'), limiteCrear, validarPlv, ctrl.crear);

// Listado y detalle solo admin
router.get('/', verificarToken, soloAdmin, ctrl.listar);
router.get('/:id', verificarToken, soloAdmin, ctrl.obtener);

module.exports = router;
