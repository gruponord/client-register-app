// Parsers de tipos de PostgreSQL para la replica del ERP.
//
// OJO: setTypeParser es GLOBAL al modulo `pg`, no por pool. Por eso vive en su
// propio fichero y lo cargan los dos pools: esconderlo dentro de uno de ellos
// haria creer que solo le afecta a el.
//
// El problema (CONTRATO-SYNC.md §7): las fechas del ERP no llevan zona y viajan
// tal cual, asi que se guardan correctas en columnas TIMESTAMP. Pero al leerlas,
// node-postgres construye un `Date` interpretando la cadena como hora local y al
// imprimirla sale desplazada. Comprobado con to_char: en la columna hay
// 2025-10-28 00:00:00, identico al ERP; el desplazamiento lo introduce el driver
// al leer, no el receptor al escribir.
//
// Donde mas peligro tiene es en erp.cli_env: hora_ini1 y hora_fin1 son franjas
// horarias, y una hora de menos no llama la atencion de nadie.
//
// La solucion es devolver la cadena cruda y no construir ningun Date. Quien
// necesite operar con ella la convierte a proposito, sabiendo que no lleva zona.
//
// Es seguro hacerlo global: se verifico que NO hay ninguna columna
// "timestamp without time zone" en el resto de la base de datos (las de la app
// son todas TIMESTAMPTZ, OID 1184, que este parser no toca).
const { types } = require('pg');

const TIMESTAMP_SIN_ZONA = 1114;

types.setTypeParser(TIMESTAMP_SIN_ZONA, (valor) => valor);

// Si algun dataset futuro declara el tipo `fechaSolo`, la columna sera DATE
// (OID 1082) y hara falta el mismo tratamiento por el mismo motivo. Hoy no hay
// ninguna, y no se registra un parser para un tipo que no se usa.

module.exports = { TIMESTAMP_SIN_ZONA };
