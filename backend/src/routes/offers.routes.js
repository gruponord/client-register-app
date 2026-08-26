const { Router } = require('express');
const { verificarToken, soloAdmin, requiereUtilidad } = require('../middlewares/auth');
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

// Guardar exige planta (va en el cuerpo); consultar y compartir no, porque la
// oferta ya guardada lleva la suya.
router.post('/', entrar, ctrl.exigirPlanta, ctrl.crear);

// El listado global es de administracion y no pasa por requiereUtilidad: un
// admin lo consulta sin tener que darse la utilidad a si mismo.
router.get('/', verificarToken, soloAdmin, ctrl.listar);
router.get('/:id', entrar, ctrl.obtener);
router.get('/:id/pdf', entrar, ctrl.pdf);
router.post('/:id/enviar', entrar, ctrl.enviar);

module.exports = router;
