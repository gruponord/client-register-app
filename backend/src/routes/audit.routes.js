const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { validarFiltrosAuditoria } = require('../middlewares/validate');
const auditController = require('../controllers/audit.controller');

const router = Router();

router.get('/', verificarToken, soloAdmin, validarFiltrosAuditoria, auditController.listar);

module.exports = router;
