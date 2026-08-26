// Datos de prueba para la utilidad de ofertas, SOLO PARA DESARROLLO LOCAL.
//
// La replica del ERP la rellena el agente del sincronizador, que en local no
// corre. Sin datos en el esquema `erp` la utilidad no tiene nada que ensenar, y
// probarla a mano significaria escribir una docena de INSERT cada vez.
//
// Los articulos son reales del catalogo de Zubillaga (datos de producto, no
// personales). Los clientes y los vendedores son inventados.
//
//   npm run seed:ofertas
//
// Se puede ejecutar tantas veces como se quiera: borra lo suyo antes de meterlo.
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const MARCA = 'SEED_OFERTAS';   // para poder borrar solo lo de este script

const VENDEDORES = [
  ['Z', '001', 'ANE ETXEBARRIA', 'ane.prueba@zuvillaga.com'],
  ['Z', '002', 'GORKA LARRAÑAGA', 'gorka.prueba@zuvillaga.com'],
];

const CLIENTES = [
  ['200001', 'BAR EL TXOKO', 'BILBAO - DEUSTO', '001', '1,3'],
  ['200002', 'CAFETERIA LA PLAZA', 'BILBAO - ABANDO', '001', '2'],
  ['200003', 'RESTAURANTE ITSASO', 'GETXO', '001', '7'],
  ['200004', 'TABERNA GOIKO', 'PORTUGALETE', '002', '1,2,3,4,5'],
  ['200005', 'HOTEL MIRAMAR', 'SANTURTZI', '002', '6'],
];

const FAMILIAS = [
  ['F01', 'Refrescos'], ['F02', 'Ibéricos y embutidos'],
  ['F03', 'Aguas'], ['F04', 'Vinos'], ['F05', 'Material de hostelería'],
];

const PROVEEDORES = [
  ['P01', 'Pepsico España SL'], ['P02', 'Campofrio Food Group SA'],
  ['P03', 'Aguas de Fontecelta SA'], ['P04', 'Bodegas del Duero SL'],
];

// [codigo, descripcion, familia, proveedor, unidad, peso, uds/caja, precio, dto]
const ARTICULOS = [
  ['000290', 'PEPSI LATA 0,33L', 'F01', 'P01', 'U', null, 24, 1.68, 70],
  ['000310', 'PEPSI MAX LATA 0,33L', 'F01', 'P01', 'U', null, 24, 1.68, 70],
  ['006815', 'PEPSI REGULAR BAG-IN-BOX 10L', 'F01', 'P01', 'U', null, 1, 246.73, 50],
  ['007555', 'AGUA FONTECELTA 0,33CL REPACK 24', 'F03', 'P03', 'U', null, 24, 0.22, 0],
  ['007554', 'AGUA FONTECELTA 0,50 REPACK 24', 'F03', 'P03', 'U', null, 24, 0.23, 0],
  ['001456', 'JAMON CAMPOFRIO COC C/PIEL EXT 6K', 'F02', 'P02', 'K', 6, 1, 6.70, 0],
  ['008225', 'MORTADELA CAMPOFRIO BOLOGNA 6K', 'F02', 'P02', 'K', 6, 1, 9.20, 0],
  ['001451', 'PALETA NAVIDUL CTRO CEBO IB.EXTREM PELAD', 'F02', 'P02', 'K', 2.65, 2, 35.80, 0],
  ['007562', 'VINO PAGO CARRAOVEJAS DO RIBERA DUERO 0,', 'F04', 'P04', 'U', null, 6, 32.83, 5],
  ['004147', 'PALET SAN MIGUEL CAJA PLASTICO 120 X 100', 'F05', null, 'U', null, 1, 35.00, 0],
  // Sin precio: NO debe aparecer en el catalogo.
  ['009001', 'ENVASE BARRIL VACIO 50L', 'F05', null, 'U', null, 1, 0, 0],
  // Marcado como fuera de catalogo: tampoco debe aparecer.
  ['009002', 'COCA-COLA ZERO LATA 0,33L (FUERA CATALOGO)', 'F01', 'P01', 'U', null, 24, 0.69, 0],
];

const USUARIO = { username: 'prueba.ofertas', password: 'Ofertas2026!' };

const ins = (tabla, cols, vals) => pool.query(
  `INSERT INTO erp.${tabla} (${cols.join(',')}, activo, sync_clave, sync_hash)
   VALUES (${vals.map((_, i) => '$' + (i + 1)).join(',')}, true, $${vals.length + 1}, $${vals.length + 2})`,
  [...vals, tabla + ':' + vals.filter((v) => v !== null).join(':'), MARCA]
);

const sembrar = async () => {
  // --- Guardarrail: esto no se ejecuta contra una base con la replica de verdad
  //
  // Los INSERT irian al esquema `erp`, que pertenece al agente del
  // sincronizador. En produccion el agente los borraria en el siguiente envio
  // completo, pero hasta entonces habria clientes y articulos inventados en las
  // busquedas de los comerciales.
  const real = await pool.query(
    "SELECT count(*)::int AS n FROM erp.datasets WHERE ultima_ejecucion IS NOT NULL");
  if (real.rows[0].n > 0) {
    console.error(
      'ABORTADO: esta base de datos recibe datos del Sincronizador GNP ' +
      '(hay ' + real.rows[0].n + ' datasets con entregas).\n' +
      'Este script solo es para una base de desarrollo vacia.');
    process.exit(1);
  }

  console.log('Sembrando datos de prueba para la utilidad de ofertas...\n');

  // --- Limpiar lo de una ejecucion anterior ---
  for (const t of ['articulos_sec', 'articulos', 'familias', 'proveedores',
    'cltes_rutas_vta', 'cli_env', 'clientes', 'rutas_venta', 'vendedores', 'secciones']) {
    await pool.query(`DELETE FROM erp.${t} WHERE sync_hash = $1`, [MARCA]);
  }
  await pool.query('DELETE FROM users WHERE username = $1', [USUARIO.username]);

  // --- Seccion y plantas ---
  await ins('secciones', ['empresa_id', 'seccion_id', 'nombre'], ['GN', 'Z', 'Comercial Zubillaga']);
  await pool.query(
    `INSERT INTO plants (code, name, active, logo_path) VALUES ('Z', 'Zubillaga', true, 'Z.jpg')
     ON CONFLICT (code) DO UPDATE SET logo_path = 'Z.jpg', active = true`);

  // --- Vendedores y rutas ---
  for (const [sec, id, nombre, email] of VENDEDORES) {
    await ins('vendedores',
      ['empresa_id', 'seccion_id', 'vendedor_id', 'nombre', 'email', 'baja', 'activoreal'],
      ['GN', sec, id, nombre, email, false, true]);
    await ins('rutas_venta',
      ['empresa_id', 'seccion_id', 'ruta_ventas_id', 'descripcion', 'vendedor_id'],
      ['GN', sec, 'R' + id, 'no se usa', id]);
  }

  // --- Clientes, con su local y su ruta ---
  for (const [id, nombre, poblacion, vendedor, dias] of CLIENTES) {
    await ins('clientes',
      ['empresa_id', 'cliente_id', 'nombre', 'poblacion', 'secpref_id', 'estado', 'nif'],
      ['GN', id, nombre, poblacion, 'Z', false, 'B' + id + '00']);
    // poblacion y domicilio vacios en cli_env: es el caso normal (95% de las
    // filas reales), y asi se prueba el respaldo a los datos de clientes.
    await ins('cli_env', ['empresa_id', 'cliente_id', 'local_id', 'nombre'], ['GN', id, '0', nombre]);
    await ins('cltes_rutas_vta',
      ['empresa_id', 'cliente_id', 'local_id', 'origen_id', 'ruta_venta_id', 'period_semana'],
      ['GN', id, '0', '0', 'R' + vendedor, dias]);
  }

  // --- Maestros del catalogo ---
  for (const [id, nombre] of FAMILIAS) {
    await ins('familias', ['empresa_id', 'familia_id', 'descripcion'], ['GN', id, nombre]);
  }
  for (const [id, nombre] of PROVEEDORES) {
    await ins('proveedores', ['empresa_id', 'proveedor_id', 'xnombre'], ['GN', id, nombre]);
  }

  // --- Articulos ---
  for (const [cod, desc, fam, prov, unidad, peso, uds, precio, dto] of ARTICULOS) {
    await ins('articulos',
      ['empresa_id', 'articulo_id', 'descripcion', 'familia_id', 'proveedor_id',
        'unidad_prin_id', 'peso_neto', 'unidades_agrup', 'quitar_catalogo'],
      ['GN', cod, desc, fam, prov, unidad, peso, uds, cod === '009002']);
    await ins('articulos_sec',
      ['empresa_id', 'articulo_id', 'seccion_id', 'precio_vta', 'por_dto',
        'status', 'vta_tpv', 'bajopedido'],
      ['GN', cod, 'Z', precio, dto, 0, true, false]);
  }

  // --- Frescura, para que el pie del PDF tenga fecha ---
  await pool.query(
    `INSERT INTO erp.datasets (dataset, ultima_ejecucion, filas, modo)
     VALUES ('erp.articulos_sec', NOW(), $1, 'delta')
     ON CONFLICT (dataset) DO UPDATE SET ultima_ejecucion = NOW()`, [ARTICULOS.length]);

  // --- Usuario con los dos permisos ---
  //
  // El correo tiene que coincidir con el de un vendedor del ERP: asi se resuelve
  // la planta. Con el de ANE se entra directo a Zubillaga.
  const hash = await bcrypt.hash(USUARIO.password, 12);
  await pool.query(
    `INSERT INTO users (username, password_hash, email, full_name, role, active, utilities)
     VALUES ($1, $2, $3, 'Usuario de pruebas (ofertas)', 'comercial', true, $4)`,
    [USUARIO.username, hash, VENDEDORES[0][3], JSON.stringify(['ofertas', 'ofertas_dto'])]
  );

  const ofrecibles = ARTICULOS.filter((a) => a[7] > 0 && a[0] !== '009002').length;
  console.log('  ' + CLIENTES.length + ' clientes en Zubillaga, con ruta y dias de visita');
  console.log('  ' + VENDEDORES.length + ' vendedores  ->  "Ruta de ANE ETXEBARRIA" y "Ruta de GORKA LARRAÑAGA"');
  console.log('  ' + ARTICULOS.length + ' articulos, de los que ' + ofrecibles + ' salen en el catalogo');
  console.log('     (009001 sin precio y 009002 fuera de catalogo NO deben aparecer)');
  console.log('  ' + FAMILIAS.length + ' familias y ' + PROVEEDORES.length + ' proveedores');
  console.log('\n  Usuario:  ' + USUARIO.username);
  console.log('  Clave:    ' + USUARIO.password);
  console.log('  Permisos: ofertas, ofertas_dto  (puede cambiar descuentos)');
  console.log('\nListo. Arranca con  npm run dev  y consulta LEEME-OFERTAS.md');

  await pool.end();
};

sembrar().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
