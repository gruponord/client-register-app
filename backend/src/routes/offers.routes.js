const { Router } = require('express');
const { verificarToken, requiereUtilidad } = require('../middlewares/auth');
const offersController = require('../controllers/offers.controller');

const router = Router();

// Toda la utilidad exige el permiso `ofertas`. Editar el descuento pide ademas
// `ofertas_dto`, que se comprueba al guardar, no al entrar.
router.get('/contexto', verificarToken, requiereUtilidad('ofertas'), offersController.contexto);

module.exports = router;
