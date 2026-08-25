const { Router } = require('express');
const express = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { verificarApiKey, descomprimirGzip, resolverDataset } = require('../middlewares/sync');
const syncController = require('../controllers/sync.controller');

const router = Router();

// Parser propio, con limite propio: un lote de 500 filas pasa del limite por
// defecto de express.json() (100kb). Este router se monta ANTES del parser
// global (ver index.js) justamente para poder poner el suyo.
const limite = `${Number(process.env.SYNC_BODY_LIMIT_MB || 64)}mb`;

// La ruta va versionada desde el primer dia: el /v1/ permite evolucionar el
// agente sin romper las apps antiguas (contrato §2).

// Estado de la replica, para la pantalla de administracion. Es la app quien
// pregunta, asi que va con JWT y no con la clave del agente. Se declara antes
// de las rutas de :dataset para que "estado" no se confunda con un dataset.
router.get('/estado', verificarToken, soloAdmin, syncController.estado);

// --- Lo que llama el agente. Sin JWT: clave de API ---
router.post(
  '/:dataset',
  verificarApiKey,
  resolverDataset,
  descomprimirGzip,
  express.json({ limit: limite }),
  syncController.recibirLote
);

router.post(
  '/:dataset/cerrar',
  verificarApiKey,
  resolverDataset,
  descomprimirGzip,
  express.json({ limit: limite }),
  syncController.cerrar
);

router.get('/:dataset/checksum', verificarApiKey, resolverDataset, syncController.checksum);

module.exports = router;
