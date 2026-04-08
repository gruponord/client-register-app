const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { auditMiddleware } = require('../middlewares/audit');
const { validarCrearUsuario, validarEditarUsuario } = require('../middlewares/validate');
const usersController = require('../controllers/users.controller');

const router = Router();

router.use(verificarToken, soloAdmin);

router.get('/', usersController.listar);
router.get('/:id', usersController.obtener);
router.post('/', validarCrearUsuario, auditMiddleware('users'), usersController.crear);
router.put('/:id', validarEditarUsuario, auditMiddleware('users'), usersController.actualizar);

module.exports = router;
