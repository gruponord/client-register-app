const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { auditMiddleware } = require('../middlewares/audit');
const { validarMaestro } = require('../middlewares/validate');
const mastersController = require('../controllers/masters.controller');

const router = Router();

// GET público (para el formulario necesita leer maestros)
router.get('/:tabla', verificarToken, mastersController.listar);
router.get('/:tabla/:id', verificarToken, mastersController.obtener);

// CRUD solo admin
router.post('/:tabla', verificarToken, soloAdmin, validarMaestro, auditMiddleware('masters'), mastersController.crear);
router.put('/:tabla/:id', verificarToken, soloAdmin, auditMiddleware('masters'), mastersController.actualizar);

module.exports = router;
