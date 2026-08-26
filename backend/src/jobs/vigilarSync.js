// Vigila que la replica del ERP siga recibiendo datos, y avisa por correo.
//
// Es la otra punta del aviso. El Sincronizador GNP avisa cuando un trabajo suyo
// falla o cuando le rechazan filas, pero hay un fallo del que no puede avisar:
// el suyo propio. Si se apaga 10.0.0.85, si se llena su disco o si systemd deja
// de disparar el timer, de alli no sale ningun correo. El unico que puede
// notarlo es el destino, viendo que su dato envejece.
//
// De ahi la regla que gobierna este fichero: NO se pregunta nada al agente. Solo
// se mira la propia base de datos. Si se preguntase a su API y no respondiese,
// no habria forma de distinguir un agente caido de un problema de red; el dato
// viejo en casa, en cambio, es senal suficiente -- algo pasa, y para avisar da
// igual el que.
//
// Se ejecuta como proceso de un solo uso, una vez por hora, disparado por el
// `cron_restart` de PM2 (ver ecosystem.config.js). NO como setInterval dentro de
// la API: esa corre en cluster con dos instancias y cada aviso saldria por
// duplicado.
//
// Uso:
//   node src/jobs/vigilarSync.js            comprueba y avisa
//   node src/jobs/vigilarSync.js --seco     comprueba y dice que haria, sin mandar
require('dotenv').config();
const pool = require('../config/db');
const sync = require('../services/sync.service');
const { enviarEmailAlertaSync } = require('../services/email.service');

// A quien se avisa. Buzon compartido y no una persona: no debe depender de que
// alguien concreto este ese dia. Admite lista separada por comas.
const DESTINO_POR_DEFECTO = 'it@gruponord.com';

// Cada cuanto se repite el aviso de una incidencia que sigue abierta. No es un
// aviso por comprobacion: es uno al dia como maximo. Sin recordatorio, un unico
// correo perdido dejaria el fallo en silencio otra vez; con uno por hora, serian
// 72 correos en tres dias y se acabarian filtrando, que es peor que ninguno.
const HORAS_RECORDATORIO = Number(process.env.ALERTA_RECORDATORIO_HORAS || 24);

const destinatarios = () => (process.env.ALERTA_PARA || DESTINO_POR_DEFECTO)
  .split(',').map((s) => s.trim()).filter(Boolean);

const marca = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...x) => console.log('[vigila-sync] ' + marca(), ...x);

/**
 * Una pasada de vigilancia.
 *
 * Todo va dentro de UNA transaccion que abarca tambien el envio del correo, y
 * eso resuelve de golpe las dos formas de equivocarse:
 *
 *   - Marcar antes de enviar: si el SMTP falla, la incidencia queda como
 *     avisada y el aviso se pierde para siempre.
 *   - Enviar antes de marcar: si el proceso muere entre las dos cosas, el aviso
 *     sale otra vez a la hora siguiente.
 *
 * Con la transaccion, o sale el correo y las marcas se quedan, o no pasa
 * ninguna de las dos cosas y se reintenta en la vuelta siguiente.
 *
 * Y de paso da la exclusion mutua gratis: el UPDATE bloquea las filas, asi que
 * si dos pasadas coincidieran, la segunda espera al COMMIT de la primera y
 * entonces ya no encuentra nada que marcar. Ni un correo duplicado.
 */
const vigilar = async ({ seco = false } = {}) => {
  const estado = await sync.estadoDatasets(pool);
  const viejos = estado.filter((d) => d.viejo).map((d) => d.dataset);
  const frescos = estado.filter((d) => !d.viejo).map((d) => d.dataset);
  const porNombre = new Map(estado.map((d) => [d.dataset, d]));

  log(estado.length + ' datasets: ' + frescos.length + ' al dia, ' + viejos.length + ' viejos');

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1. Una fila por incidencia abierta. ON CONFLICT DO NOTHING porque la que
    //    ya existe conserva su detectado_at: interesa cuando EMPEZO, no cuando
    //    se ha vuelto a mirar.
    for (const d of viejos) {
      await cliente.query(
        `INSERT INTO sync_alertas (dataset, horas_al_abrir) VALUES ($1, $2)
         ON CONFLICT (dataset) DO NOTHING`,
        [d, porNombre.get(d).horas_desde]
      );
    }

    // 2. Cuales toca avisar. La condicion va DENTRO de la sentencia y no en un
    //    `if` de JavaScript, que es lo que la hace a prueba de carreras.
    //
    //    `avisos = 0` recoge dos casos en uno: la incidencia que acaba de
    //    abrirse y la que se abrio pero cuyo correo fallo. Ese segundo caso es
    //    el que se me habia escapado en la primera version: sin el, un SMTP de
    //    mal humor dejaba la incidencia muda para siempre, porque ya no era
    //    nueva y todavia no tenia avisado_at para el recordatorio.
    const { rows: aAvisar } = await cliente.query(
      `UPDATE sync_alertas
          SET avisado_at = NOW(), avisos = avisos + 1
        WHERE dataset = ANY($1)
          AND (avisos = 0 OR avisado_at < NOW() - make_interval(hours => $2::int))
        RETURNING dataset, avisos`,
      [viejos, HORAS_RECORDATORIO]
    );
    // avisos ya viene incrementado: 1 es el primer aviso, mas es recordatorio.
    const rotos = aAvisar.filter((r) => r.avisos === 1)
      .map((r) => porNombre.get(r.dataset)).filter(Boolean);
    const recordados = aAvisar.filter((r) => r.avisos > 1)
      .map((r) => porNombre.get(r.dataset)).filter(Boolean);

    // 3. Las que se cierran.
    const { rows: cerradas } = await cliente.query(
      `DELETE FROM sync_alertas WHERE dataset = ANY($1)
         RETURNING dataset, avisos`,
      [frescos]
    );
    // Solo se avisa de la recuperacion de lo que se llego a avisar: un "ya esta
    // arreglado" de algo que nadie sabia que estaba roto solo desconcierta.
    const recuperados = cerradas.filter((r) => r.avisos > 0)
      .map((r) => porNombre.get(r.dataset)).filter(Boolean);
    const mudas = cerradas.length - recuperados.length;
    if (mudas > 0) log(mudas + ' incidencia(s) cerrada(s) sin haberse llegado a avisar');

    for (const d of rotos) {
      log('SE ABRE   ' + d.dataset + '  ' +
        (d.horas_desde === null ? 'nunca recibido' : d.horas_desde + ' h'));
    }
    for (const d of recordados) log('SIGUE     ' + d.dataset);
    for (const d of recuperados) log('SE CIERRA ' + d.dataset);

    if (!rotos.length && !recordados.length && !recuperados.length) {
      // Nada que contar. Se confirma igual, porque el punto 3 puede haber
      // limpiado incidencias que se cerraron sin avisar y esa limpieza vale.
      await cliente.query('COMMIT');
      log('sin novedades: no se manda correo');
      return { rotos, recordados, recuperados, enviado: false };
    }

    const para = destinatarios();
    if (seco) {
      await cliente.query('ROLLBACK');
      log('--seco: no se manda nada ni se marca nada. Iria a ' + para.join(', '));
      return { rotos, recordados, recuperados, enviado: false, seco: true };
    }

    const r = await enviarEmailAlertaSync(para, { rotos, recordados, recuperados });
    await cliente.query('COMMIT');
    log('correo enviado a ' + r.destinatarios.join(', ') + ': ' + r.asunto);
    return { rotos, recordados, recuperados, enviado: true, asunto: r.asunto };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    log('ERROR: ' + err.message + ' (nada marcado; se reintenta en la vuelta siguiente)');
    throw err;
  } finally {
    cliente.release();
  }
};

// Solo se conecta y cierra el pool cuando se ejecuta como programa; asi las
// pruebas pueden llamar a vigilar() con su propio ciclo de vida.
if (require.main === module) {
  vigilar({ seco: process.argv.includes('--seco') })
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(() => pool.end().finally(() => process.exit(1)));
}

module.exports = { vigilar, destinatarios, HORAS_RECORDATORIO };
