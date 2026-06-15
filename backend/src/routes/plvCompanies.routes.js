const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { auditMiddleware } = require('../middlewares/audit');
const { validarMaestro } = require('../middlewares/validate');
const ctrl = require('../controllers/plvCompanies.controller');

const router = Router();

// Listado disponible para usuarios autenticados (el formulario PLV necesita
// las empresas activas asignadas al usuario).
router.get('/', verificarToken, ctrl.listar);
router.get('/:id', verificarToken, ctrl.obtener);

router.post('/', verificarToken, soloAdmin, validarMaestro, auditMiddleware('plv_companies'), ctrl.crear);
router.put('/:id', verificarToken, soloAdmin, auditMiddleware('plv_companies'), ctrl.actualizar);

router.get('/:id/emails', verificarToken, soloAdmin, ctrl.listarEmails);
router.post('/:id/emails', verificarToken, soloAdmin, auditMiddleware('plv_company_emails'), ctrl.agregarEmail);
router.delete('/:id/emails/:emailId', verificarToken, soloAdmin, auditMiddleware('plv_company_emails'), ctrl.eliminarEmail);

module.exports = router;
