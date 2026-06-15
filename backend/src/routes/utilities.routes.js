const { Router } = require('express');
const { verificarToken } = require('../middlewares/auth');
const { UTILIDADES } = require('../config/utilities');

const router = Router();

// Devuelve el catalogo de utilidades disponibles para pintar el formulario
// de admin (checkboxes en alta/edicion de usuario).
router.get('/', verificarToken, (req, res) => {
  res.json(UTILIDADES);
});

module.exports = router;
