// Pool del receptor de sincronizacion.
//
// Separado del pool de la app a proposito: el contrato quiere que el unico que
// escriba en el esquema `erp` sea este endpoint, y la app lo lea (§6). Con dos
// conexiones distintas eso lo garantiza PostgreSQL y no la disciplina de quien
// escriba la siguiente consulta.
//
// Si SYNC_DATABASE_URL no esta puesta se reutiliza DATABASE_URL: el receptor
// funciona igual y la separacion se puede activar despues sin tocar codigo
// (ver src/db/permisos-sync.sql).
require('./pgTypes');

const { Pool } = require('pg');

const separado = Boolean(process.env.SYNC_DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.SYNC_DATABASE_URL || process.env.DATABASE_URL,
  // Los lotes llegan de uno en uno desde un solo agente: no hace falta mas, y
  // asi el sync no puede agotar las conexiones que necesita la app.
  max: Number(process.env.SYNC_DB_POOL_MAX || 4),
});

pool.on('error', (err) => {
  // A diferencia del pool de la app, aqui NO se mata el proceso: una caida del
  // receptor no debe tirar la aplicacion. El agente reintenta.
  console.error('Error inesperado en el pool de sincronizacion:', err);
});

if (!separado) {
  console.warn(
    '[sync] SYNC_DATABASE_URL no configurada: el receptor escribe en `erp` con ' +
    'el usuario de la app. Ver src/db/permisos-sync.sql.'
  );
}

module.exports = pool;
