const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { validarSubmission } = require('../middlewares/validate');
const upload = require('../middlewares/upload');
const submissionsController = require('../controllers/submissions.controller');

const router = Router();

const submissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
});

// Listar solo admin
router.get('/', verificarToken, soloAdmin, submissionsController.listar);
router.get('/:id', verificarToken, submissionsController.obtener);

// Crear - cualquier usuario autenticado
router.post('/',
  verificarToken,
  submissionLimiter,
  upload.array('files', 20),
  validarSubmission,
  submissionsController.crear
);

module.exports = router;
