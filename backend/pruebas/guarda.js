// No dejar que las pruebas se ejecuten contra una base que no sea de desarrollo.
//
// Hace falta porque las suites son DESTRUCTIVAS: cinco hacen TRUNCATE del
// esquema `erp` y todas siembran y borran filas. Mientras vivieron en un
// directorio temporal eso daba igual; desde que viajan con el repositorio estan
// tambien en el servidor de produccion, donde `DATABASE_URL` apunta a la base de
// verdad. Un `npm run pruebas` alli se llevaria la replica entera por delante:
// 148.000 filas, con los 35.268 clientes.
//
// La comprobacion del host va en el CUERPO del modulo, no en una funcion: asi
// basta con requerirlo para que actue, y no hay que acordarse de llamar a nada
// ni colocar la llamada en el sitio correcto de cada fichero. Requerir es
// suficiente.
const { URL } = require('url');

const LOCALES = ['localhost', '127.0.0.1', '::1', '[::1]'];

const url = process.env.DATABASE_URL || '';
let host = '';
try { host = new URL(url).hostname; } catch (_) { host = ''; }

if (!LOCALES.includes(host)) {
  console.error('\n  ABORTADO: las pruebas son destructivas y esta base no es local.');
  console.error('  DATABASE_URL apunta a "' + (host || '(no se puede leer)') + '".');
  console.error('  Hacen TRUNCATE del esquema `erp`. No se ejecutan aqui.\n');
  process.exit(1);
}

/**
 * Segunda barrera, esta contra la base ya abierta.
 *
 * Una base que ha recibido lotes del agente es una replica de verdad, diga lo
 * que diga el host: por un tunel SSH, produccion tambien se ve como
 * "localhost". Solo la puede comprobar quien ya tiene un pool, asi que la llama
 * el lanzador una vez, antes de arrancar nada.
 *
 * Mismo criterio que usan `importarMuestraErp.js` y `seedOfertas.js`.
 */
const noEsUnaReplicaDeVerdad = async (pool) => {
  try {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM erp.sync_recibidos WHERE recibido > NOW() - INTERVAL '30 days'"
    );
    if (rows[0].n > 0) {
      console.error('\n  ABORTADO: esta base ha recibido ' + rows[0].n + ' lotes del');
      console.error('  Sincronizador en los ultimos 30 dias, asi que es una replica de verdad.');
      console.error('  Las pruebas harian TRUNCATE de `erp`. No se ejecutan aqui.\n');
      process.exit(1);
    }
  } catch (_) {
    // Si la tabla no existe, es que aqui no ha sincronizado nadie nunca.
  }
};

module.exports = { noEsUnaReplicaDeVerdad };
