const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { validarLogin } = require('../middlewares/validate');
const { verificarToken } = require('../middlewares/auth');
const authController = require('../controllers/auth.controller');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: { error: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, validarLogin, authController.login);
router.post('/refresh', authController.refreshToken);
router.get('/me', verificarToken, authController.me);
router.post('/forgot-password', forgotLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/change-password', verificarToken, authController.changePassword);

module.exports = router;
