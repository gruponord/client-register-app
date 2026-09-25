// Lanza todas las suites y dice la verdad sobre cada una.
//
// Contar lineas "FALLO" no basta: una suite que revienta antes de la primera
// asercion no imprime ninguna, y entonces el recuento da CERO y parece verde.
// Casi cuela un falso verde por esto. Aqui una suite solo aprueba si termina
// con "todo correcto" Y sale con codigo 0.
const { spawnSync, spawn, execSync } = require('child_process');
const path = require('path');
// El .env primero: la guarda mira DATABASE_URL, y este fichero no lo cargaba
// porque hasta ahora solo lanzaba procesos hijo, que lo cargan cada uno.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('./guarda');   // aborta si la base no es de desarrollo

const AQUI = __dirname;
const APP = path.join(__dirname, '..');

// Casi todas piden un servidor en el 3999, y las de sincronizacion ademas
// esperan SU clave de API, no la del .env. `prueba-cluster` es la excepcion:
// arranca sus propias instancias, asi que corre con el puerto libre.
const CON_SERVIDOR = [
  'prueba-receptor', 'prueba-nuevos', 'prueba-art-cli',
  'prueba-ofertas1', 'prueba-ofertas2', 'prueba-ofertas3', 'prueba-ofertas4',
  'prueba-ofertas5', 'prueba-ofertas6', 'prueba-vigilancia',
];
const SIN_SERVIDOR = ['prueba-cluster'];
const SUITES = [...CON_SERVIDOR, ...SIN_SERVIDOR];

const matarPuerto = () => {
  try {
    execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3999 -State Listen '
      + '-ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | '
      + 'ForEach-Object { Stop-Process -Id $_ -Force }"', { stdio: 'ignore' });
  } catch (_) { /* no habia nada escuchando */ }
};

const esperar = async (ms) => new Promise((r) => setTimeout(r, ms));

const arrancar = async () => {
  matarPuerto();
  const s = spawn('node', ['src/index.js'], {
    cwd: APP, detached: true, stdio: 'ignore',
    env: { ...process.env, PORT: '3999', SYNC_API_KEY: 'clave-de-prueba-e2e' },
  });
  s.unref();
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:3999/api/health');
      if (r.ok) return s;
    } catch (_) { /* todavia no */ }
    await esperar(250);
  }
  throw new Error('el servidor de pruebas no levanto en el 3999');
};

let malas = 0;

const correr = (lista) => {
for (const s of lista) {
  const r = spawnSync('node', [path.join(AQUI, s + '.js')], {
    cwd: APP, encoding: 'utf8', timeout: 180000,
  });
  const salida = (r.stdout || '') + (r.stderr || '');
  const fallos = (salida.match(/^ {2}FALLO/gm) || []).length;

  // El CODIGO DE SALIDA es la verdad: las dos familias de suite salen con 0 si
  // todo fue bien y con 1 si fallo algo o si reventaron. Las cuentas de lineas
  // "FALLO" solo sirven para dar detalle -- fiarse de ellas fue lo que casi
  // cuela un falso verde, porque una suite que revienta antes de la primera
  // asercion no imprime ninguna y el recuento daba cero.
  let estado;
  if (r.status === 0) estado = 'ok';
  else if (fallos) estado = fallos + ' fallo(s)';
  else estado = 'revento sin llegar a comprobar nada';
  if (estado !== 'ok') malas++;

  console.log('  ' + s.padEnd(20) + estado);
  if (estado !== 'ok') {
    for (const l of salida.split('\n').filter((x) => /^ {2}FALLO|EXCEPCION/.test(x)).slice(0, 5)) {
      console.log('      ' + l.trim());
    }
  }
}
};

(async () => {
  // Segunda barrera: por un tunel SSH, produccion tambien se ve como localhost.
  const pool = require(path.join(__dirname, '..', 'src/config/db.js'));
  await require('./guarda').noEsUnaReplicaDeVerdad(pool);
  await pool.end();

  const srv = await arrancar();
  try { correr(CON_SERVIDOR); } finally {
    try { process.kill(-srv.pid); } catch (_) { try { srv.kill(); } catch (_) {} }
    matarPuerto();
  }
  correr(SIN_SERVIDOR);

  console.log('\n  ' + (malas ? malas + ' suite(s) con problemas'
    : 'las ' + SUITES.length + ' suites en verde'));
  process.exit(malas ? 1 : 0);
})();
