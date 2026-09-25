// Suite 6 -- la vigilancia de la frescura de la replica.
//
// No manda ni un correo: se sustituye nodemailer.createTransport por uno que se
// queda con el mensaje. Asi se puede comprobar el ciclo entero de una incidencia
// (se abre, se recuerda, se cierra) y de paso leer el texto que le llegaria a
// sistemas, que es la mitad del trabajo.
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(APP, '.env') });
require('./guarda');   // aborta si la base no es de desarrollo

const nodemailer = require('nodemailer');
const pool = require(path.join(APP, 'src/config/db.js'));
const { DATASETS } = require(path.join(APP, 'src/config/datasets.js'));

// --- El buzon de mentira. Se pincha ANTES de cargar el job. ---
const enviados = [];
let fallarEnvio = false;
nodemailer.createTransport = () => ({
  sendMail: async (m) => {
    if (fallarEnvio) throw new Error('SMTP de mal humor (simulado)');
    enviados.push(m);
    return { messageId: 'prueba' };
  },
});

const job = require(path.join(APP, 'src/jobs/vigilarSync.js'));

let fallos = 0;
const ok = (c, q, v) => {
  if (c) console.log('  OK    ' + q + (v !== undefined ? '  -> ' + v : ''));
  else { fallos++; console.log('  FALLO ' + q + '  -> ' + JSON.stringify(v)); }
};

const D = 'erp.familias';        // el dataset con el que se juega
const OTRO = 'erp.proveedores';

// Estado real de erp.datasets, para devolverlo tal cual al terminar.
let respaldo = null;

const guardar = async () => {
  const { rows } = await pool.query('SELECT dataset, ultima_ejecucion FROM erp.datasets');
  respaldo = rows;
};
const restaurar = async () => {
  for (const r of respaldo) {
    await pool.query('UPDATE erp.datasets SET ultima_ejecucion = $2 WHERE dataset = $1',
      [r.dataset, r.ultima_ejecucion]);
  }
  await pool.query('DELETE FROM sync_alertas');
};

/** Pone todos los datasets al dia, para partir de un estado conocido. */
const todoAlDia = async () => {
  for (const d of Object.keys(DATASETS)) {
    await pool.query(
      `INSERT INTO erp.datasets (dataset, ultima_ejecucion, filas, checksum, modo)
            VALUES ($1, NOW(), 0, 'x', 'delta')
       ON CONFLICT (dataset) DO UPDATE SET ultima_ejecucion = NOW()`,
      [d]
    );
  }
  await pool.query('DELETE FROM sync_alertas');
};

const envejecer = async (dataset, horas) => pool.query(
  'UPDATE erp.datasets SET ultima_ejecucion = NOW() - make_interval(hours => $2::int) WHERE dataset = $1',
  [dataset, horas]);

const abiertas = async () => (await pool.query(
  'SELECT dataset, avisos, avisado_at FROM sync_alertas ORDER BY dataset')).rows;

(async () => {
  await guardar();
  try {
    console.log('\n=== 1. CON TODO AL DIA NO SE MANDA NADA ===');
    await todoAlDia();
    enviados.length = 0;
    let r = await job.vigilar();
    ok(!r.enviado && !enviados.length, 'ni un correo con los diez datasets al dia',
      r.rotos.length + ' rotos');
    ok((await abiertas()).length === 0, 'y ninguna incidencia abierta');

    console.log('\n=== 2. UN DATASET VIEJO ABRE INCIDENCIA Y AVISA ===');
    const umbral = DATASETS[D].frescuraHoras;
    await envejecer(D, umbral + 4);
    enviados.length = 0;
    r = await job.vigilar();
    ok(r.enviado && enviados.length === 1, 'un correo, uno solo', enviados.length);
    ok(r.rotos.length === 1 && r.rotos[0].dataset === D, 'y por el dataset correcto',
      r.rotos.map((x) => x.dataset).join(','));
    const a = await abiertas();
    ok(a.length === 1 && a[0].dataset === D && a[0].avisos === 1,
      'incidencia abierta y marcada como avisada', JSON.stringify(a[0] && { d: a[0].dataset, avisos: a[0].avisos }));
    const m = enviados[0];
    ok(/ALERTA/.test(m.subject) && m.subject.includes('1 dataset'), 'el asunto dice que y cuanto', m.subject);
    ok(m.to === 'it@gruponord.com', 'va al buzon compartido', m.to);
    ok(m.text.includes(D) && m.text.includes('10.0.0.85'),
      'el texto plano nombra el dataset y donde mirar');
    ok(m.text.includes(String(umbral)), 'y dice el umbral', umbral + ' h');

    console.log('\n=== 3. LA SEGUNDA VUELTA NO REPITE EL CORREO ===');
    // Esto es lo que se pidio: un aviso por incidencia, no uno por comprobacion.
    enviados.length = 0;
    for (let i = 0; i < 5; i++) r = await job.vigilar();
    ok(!enviados.length, 'cinco comprobaciones mas y ni un correo', enviados.length);
    const a2 = await abiertas();
    ok(a2.length === 1 && a2[0].avisos === 1, 'la incidencia sigue con un solo aviso', a2[0].avisos);

    console.log('\n=== 4. AL DIA SIGUIENTE SE RECUERDA, UNA VEZ ===');
    await pool.query("UPDATE sync_alertas SET avisado_at = NOW() - INTERVAL '25 hours'");
    enviados.length = 0;
    r = await job.vigilar();
    ok(enviados.length === 1 && r.recordados.length === 1, 'un recordatorio', enviados[0]?.subject);
    ok(/sigue/i.test(enviados[0].subject), 'y el asunto dice que sigue', enviados[0].subject);
    enviados.length = 0;
    for (let i = 0; i < 3; i++) await job.vigilar();
    ok(!enviados.length, 'y no se repite hasta el dia siguiente', enviados.length);
    ok((await abiertas())[0].avisos === 2, 'dos avisos en total');

    console.log('\n=== 5. AL RECUPERARSE, AVISA Y CIERRA ===');
    await envejecer(D, 0);
    enviados.length = 0;
    r = await job.vigilar();
    ok(enviados.length === 1 && r.recuperados.length === 1, 'un correo de recuperacion',
      enviados[0]?.subject);
    ok(/recuperad/i.test(enviados[0].subject), 'el asunto lo dice', enviados[0].subject);
    ok((await abiertas()).length === 0, 'y la incidencia se cierra');
    enviados.length = 0;
    await job.vigilar();
    ok(!enviados.length, 'sin repetir la recuperacion');

    console.log('\n=== 6. UN DATASET QUE NUNCA HA RECIBIDO NADA ===');
    // El caso mas grave: no tiene fila en erp.datasets, asi que recorriendo esa
    // tabla no aparece. Solo se ve recorriendo el registro de la app.
    await todoAlDia();
    await pool.query('DELETE FROM erp.datasets WHERE dataset = $1', [D]);
    enviados.length = 0;
    r = await job.vigilar();
    ok(r.rotos.length === 1 && r.rotos[0].dataset === D, 'se detecta el que no tiene fila',
      r.rotos.map((x) => x.dataset).join(','));
    ok(r.rotos[0].nunca_recibido === true && r.rotos[0].horas_desde === null,
      'marcado como nunca recibido');
    ok(enviados[0].text.includes('nunca ha recibido nada'),
      'y el correo lo dice con palabras', 'nunca ha recibido nada');

    console.log('\n=== 7. SI SE CAE EL AGENTE, UN CORREO Y NO DIEZ ===');
    // El escenario que de verdad importa: se apaga 10.0.0.85 y los diez datasets
    // envejecen a la vez. Diez correos del mismo incidente se leerian como ruido.
    await todoAlDia();
    for (const d of Object.keys(DATASETS)) await envejecer(d, 40);
    enviados.length = 0;
    r = await job.vigilar();
    ok(enviados.length === 1, 'UN correo para los diez datasets', enviados.length);
    ok(r.rotos.length === 10, 'con los diez dentro', r.rotos.length);
    ok(enviados[0].subject.includes('10 datasets'), 'y el asunto lo dice', enviados[0].subject);
    for (const d of Object.keys(DATASETS)) {
      if (!enviados[0].text.includes(d)) ok(false, 'falta ' + d + ' en el correo');
    }
    ok(Object.keys(DATASETS).every((d) => enviados[0].text.includes(d)),
      'los diez nombrados en el texto');

    console.log('\n=== 8. SI FALLA EL SMTP, NADA QUEDA MARCADO ===');
    // El fallo que se me habia escapado en la primera version: si el correo
    // falla y la incidencia queda marcada como avisada, el aviso se pierde para
    // siempre. Con la transaccion, o salen las dos cosas o ninguna.
    await todoAlDia();
    await envejecer(D, umbral + 4);
    enviados.length = 0;
    fallarEnvio = true;
    let exploto = false;
    try { await job.vigilar(); } catch (e) { exploto = true; }
    fallarEnvio = false;
    ok(exploto, 'la pasada falla y se entera quien la lance');
    ok(!enviados.length, 'no se mando nada');
    ok((await abiertas()).length === 0, 'y NO queda incidencia marcada a medias',
      JSON.stringify(await abiertas()));
    // Y en la vuelta siguiente, con el SMTP recuperado, el aviso sale.
    r = await job.vigilar();
    ok(enviados.length === 1 && r.rotos.length === 1,
      'a la vuelta siguiente el aviso sale', enviados[0]?.subject);

    console.log('\n=== 9. --seco no manda ni marca ===');
    await todoAlDia();
    await envejecer(D, umbral + 4);
    enviados.length = 0;
    r = await job.vigilar({ seco: true });
    ok(!enviados.length && r.seco === true, 'no manda', enviados.length);
    ok((await abiertas()).length === 0, 'y no deja rastro, asi que se puede repetir');
    r = await job.vigilar({ seco: true });
    ok(r.rotos.length === 1, 'sigue viendo la misma incidencia', r.rotos[0].dataset);

    console.log('\n=== 10. ASI QUEDA EL CORREO ===');
    await todoAlDia();
    await envejecer(D, 31);
    await envejecer(OTRO, 99);
    enviados.length = 0;
    await job.vigilar();
    console.log('  Asunto: ' + enviados[0].subject);
    console.log('  Para:   ' + enviados[0].to);
    console.log('  ---');
    for (const l of enviados[0].text.split('\n')) console.log('  | ' + l);

    console.log('\n=== 11. LA PANTALLA Y EL CORREO DICEN LO MISMO ===');
    // Comparten estadoDatasets(), asi que no pueden discrepar. Se comprueba que
    // sigue siendo asi por si alguien vuelve a duplicar el calculo.
    const s = require(path.join(APP, 'src/services/sync.service.js'));
    const est = await s.estadoDatasets(pool);
    const viejosServicio = est.filter((x) => x.viejo).map((x) => x.dataset).sort();
    await todoAlDia();
    await envejecer(D, 31);
    await envejecer(OTRO, 99);
    const est2 = await s.estadoDatasets(pool);
    ok(est2.length === Object.keys(DATASETS).length,
      'estadoDatasets recorre el registro entero', est2.length + ' datasets');
    ok(viejosServicio.join(',') === [D, OTRO].sort().join(','),
      'y marca viejos los mismos que el correo', viejosServicio.join(','));
  } finally {
    await restaurar();
    console.log('\n(estado de erp.datasets restaurado)');
  }

  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo correcto'));
  await pool.end();
  process.exit(fallos ? 1 : 0);
})().catch(async (e) => { console.error(e); try { await restaurar(); } catch (_) {} process.exit(1); });
