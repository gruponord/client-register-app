const { Router } = require('express');
const { verificarToken, requiereUtilidad } = require('../middlewares/auth');
const ctrl = require('../controllers/offers.controller');

const router = Router();

// Toda la utilidad exige el permiso `ofertas`. Editar el descuento pide ademas
// `ofertas_dto`, que se comprueba al guardar, no al entrar.
const entrar = [verificarToken, requiereUtilidad('ofertas')];

router.get('/contexto', entrar, ctrl.contexto);

// Las consultas de datos del ERP van todas detras de exigirPlanta, que
// comprueba que la planta pedida es una de las del usuario.
router.get('/rutas', entrar, ctrl.exigirPlanta, ctrl.rutas);
router.get('/clientes', entrar, ctrl.exigirPlanta, ctrl.clientes);
router.get('/filtros', entrar, ctrl.exigirPlanta, ctrl.filtros);
router.get('/articulos', entrar, ctrl.exigirPlanta, ctrl.articulos);

module.exports = router;
