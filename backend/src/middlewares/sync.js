// Middlewares del receptor de sincronizacion.
//
// El agente no es un usuario: no tiene JWT ni sesion. Se autentica con una
// clave de API propia, distinta de las de las demas apps, para poder revocarla
// sola (contrato §2).
const crypto = require('crypto');
const zlib = require('zlib');
const { obtenerDataset } = require('../config/datasets');

/**
 * Comparacion en tiempo constante. Con `!==` el tiempo de respuesta filtra
 * cuantos caracteres iniciales de la clave son correctos.
 */
const igualSeguro = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Valida X-Api-Key. Un 401 no lo reintenta el agente: alerta de inmediato, que
 * es lo que se quiere cuando la clave esta mal o caducada (§7).
 */
const verificarApiKey = (req, res, next) => {
  const esperada = process.env.SYNC_API_KEY;

  // Sin clave configurada el endpoint no se abre: quedaria aceptando escrituras
  // de cualquiera en el esquema `erp`. 503 y no 401 porque el fallo es nuestro.
  if (!esperada) {
    console.error('[sync] peticion rechazada: SYNC_API_KEY no esta configurada');
    return res.status(503).json({ error: 'Receptor de sincronizacion no configurado' });
  }

  const recibida = req.get('X-Api-Key');
  if (!recibida || !igualSeguro(recibida, esperada)) {
    console.warn(`[sync] clave de API invalida desde ${req.ip} para ${req.originalUrl}`);
    return res.status(401).json({ error: 'Clave de API invalida' });
  }

  next();
};

/**
 * Descomprime el cuerpo si viene con Content-Encoding: gzip (§2), antes de que
 * lo vea el parser de JSON. El agente comprime a partir de 1KB, asi que en la
 * practica llegan comprimidos todos los lotes con datos.
 */
const descomprimirGzip = (req, res, next) => {
  if (req.headers['content-encoding'] !== 'gzip') return next();

  const trozos = [];
  let bytes = 0;
  let cortado = false;
  const limite = Number(process.env.SYNC_BODY_LIMIT_MB || 64) * 1024 * 1024;

  req.on('data', (trozo) => {
    if (cortado) return;
    bytes += trozo.length;
    if (bytes > limite) {
      // Se corta la lectura en vez de acumular en memoria hasta reventar.
      cortado = true;
      res.status(413).json({ error: 'Cuerpo demasiado grande' });
      req.destroy();
      return;
    }
    trozos.push(trozo);
  });

  req.on('end', () => {
    if (cortado) return;
    zlib.gunzip(Buffer.concat(trozos), (err, plano) => {
      if (err) return res.status(400).json({ error: 'Cuerpo gzip invalido' });
      try {
        req.body = JSON.parse(plano.toString('utf8'));
      } catch (e) {
        return res.status(400).json({ error: 'Cuerpo gzip que no contiene JSON valido' });
      }
      // El cuerpo ya esta parseado y el stream consumido. `_body` es la senal
      // que mira body-parser para no volver a leerlo: sin ella, el
      // express.json() de la ruta revienta con "stream is not readable".
      req._body = true;
      delete req.headers['content-encoding'];
      next();
    });
  });

  req.on('error', (err) => {
    if (!cortado) next(err);
  });
};

/**
 * Resuelve el dataset de la ruta contra el registro de la app. Un dataset que
 * esta app no conoce es un 404: el agente no lo reintenta y avisa, que es mejor
 * que aceptar en silencio datos que no se guardan en ninguna parte.
 */
const resolverDataset = (req, res, next) => {
  const def = obtenerDataset(req.params.dataset);
  if (!def) {
    return res.status(404).json({ error: `Dataset desconocido: ${req.params.dataset}` });
  }
  req.dataset = req.params.dataset;
  req.def = def;
  next();
};

module.exports = { verificarApiKey, descomprimirGzip, resolverDataset };
