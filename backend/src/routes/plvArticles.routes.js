const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { auditMiddleware } = require('../middlewares/audit');
const { validarPlvArticle } = require('../middlewares/validate');
const ctrl = require('../controllers/plvArticles.controller');

const router = Router();

// Listar (autenticado: el formulario PLV lo necesita filtrando por empresa)
router.get('/', verificarToken, ctrl.listar);
router.get('/:id', verificarToken, ctrl.obtener);

// CRUD solo admin
router.post('/', verificarToken, soloAdmin, validarPlvArticle, auditMiddleware('plv_articles'), ctrl.crear);
router.put('/:id', verificarToken, soloAdmin, auditMiddleware('plv_articles'), ctrl.actualizar);

module.exports = router;
