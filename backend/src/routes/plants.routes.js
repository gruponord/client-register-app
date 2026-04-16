const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { auditMiddleware } = require('../middlewares/audit');
const { validarMaestro } = require('../middlewares/validate');
const plantsController = require('../controllers/plants.controller');

const router = Router();

router.get('/', verificarToken, plantsController.listar);
router.get('/:id', verificarToken, plantsController.obtener);

// CRUD solo admin
router.post('/', verificarToken, soloAdmin, validarMaestro, auditMiddleware('plants'), plantsController.crear);
router.put('/:id', verificarToken, soloAdmin, auditMiddleware('plants'), plantsController.actualizar);

// Emails de planta
router.get('/:id/emails', verificarToken, plantsController.listarEmails);
router.post('/:id/emails', verificarToken, soloAdmin, auditMiddleware('plant_emails'), plantsController.agregarEmail);
router.delete('/:id/emails/:emailId', verificarToken, soloAdmin, auditMiddleware('plant_emails'), plantsController.eliminarEmail);

// Emails de prospección
router.get('/:id/prospecting-emails', verificarToken, plantsController.listarEmailsProspecting);
router.post('/:id/prospecting-emails', verificarToken, soloAdmin, auditMiddleware('plant_prospecting_emails'), plantsController.agregarEmailProspecting);
router.delete('/:id/prospecting-emails/:emailId', verificarToken, soloAdmin, auditMiddleware('plant_prospecting_emails'), plantsController.eliminarEmailProspecting);

module.exports = router;
