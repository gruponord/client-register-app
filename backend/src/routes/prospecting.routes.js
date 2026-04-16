const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { validarProspecting } = require('../middlewares/validate');
const upload = require('../middlewares/upload');
const rateLimit = require('express-rate-limit');
const prospectingController = require('../controllers/prospecting.controller');

const router = Router();

const limiteCrear = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 10,
  message: { error: 'Demasiadas solicitudes, intente de nuevo más tarde' },
});

// Crear prospección (autenticado, con ficheros opcionales)
router.post('/', verificarToken, limiteCrear, upload.array('files', 20), validarProspecting, prospectingController.crear);

// Listar y detalle (solo admin)
router.get('/', verificarToken, soloAdmin, prospectingController.listar);
router.get('/:id', verificarToken, soloAdmin, prospectingController.obtener);

module.exports = router;
