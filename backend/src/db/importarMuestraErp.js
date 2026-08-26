// Carga en la base LOCAL una muestra de la replica del ERP, SOLO PARA DESARROLLO.
//
// La replica la rellena el agente del sincronizador, que en local no corre. Sin
// datos en el esquema `erp` la utilidad de ofertas no tiene nada que ensenar, y
// los datos inventados no valen para juzgar si una pantalla se ve bien: las
// descripciones reales son mas largas, los precios tienen cuatro decimales y los
// nombres de cliente traen tildes y comas.
//
//   node src/db/importarMuestraErp.js ruta/al/muestra-erp.json
//
// El fichero se genera en el servidor y NO se guarda en el repositorio: pesa 9 MB
// y los clientes son datos personales.
//
// ⚠️ La muestra lleva nombres, NIF, domicilios y correos de clientes reales.
// Trata la base de desarrollo como lo que es: una copia de datos personales en
// un portatil. Borrala cuando no la necesites (npm run migrate la deja vacia
// otra vez si antes se hace DROP SCHEMA erp CASCADE).
require('dotenv').config();
const fs = require('fs');
const pool = require('../config/db');

// El orden importa poco porque no hay claves foraneas entre tablas de replica,
// pero se mantiene el de dependencia logica para que un fallo se lea mejor.
const TABLAS = ['secciones', 'vendedores', 'rutas_venta', 'familias', 'proveedores',
  'articulos', 'articulos_sec', 'clientes', 'cli_env', 'cltes_rutas_vta'];

const importar = async () => {
  const fichero = process.argv[2];
  if (!fichero) {
    console.error('Falta la ruta del fichero.\n' +
      '  node src/db/importarMuestraErp.js ruta/al/muestra-erp.json');
    process.exit(1);
  }
  if (!fs.existsSync(fichero)) {
    console.error('No existe: ' + fichero);
    process.exit(1);
  }

  // --- Guardarrail: esto NO se ejecuta contra la base de produccion ---
  //
  // Escribir en `erp` desde fuera del receptor es exactamente lo que el contrato
  // prohibe: el esquema pertenece al agente. En una base que recibe de verdad,
  // este script machacaria la replica hasta el siguiente envio completo.
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM erp.sync_recibidos WHERE recibido > NOW() - INTERVAL '30 days'");
  if (rows[0].n > 0) {
    console.error(
      'ABORTADO: esta base ha recibido ' + rows[0].n + ' lotes del Sincronizador GNP ' +
      'en los ultimos 30 dias.\nEste script solo es para una base de desarrollo.');
    process.exit(1);
  }

  const datos = JSON.parse(fs.readFileSync(fichero, 'utf8'));
  console.log('Importando muestra de la replica en la base local...\n');

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // Se vacia primero: la muestra sustituye lo que hubiera, no se acumula.
    for (const t of [...TABLAS].reverse()) {
      await cliente.query(`TRUNCATE erp.${t}`);
    }

    for (const t of TABLAS) {
      const filas = datos[t] || [];
      if (!filas.length) { console.log('  ' + t.padEnd(18) + '     0'); continue; }

      const cols = Object.keys(filas[0]);
      const marcas = cols.map((_, i) => '$' + (i + 1)).join(',');
      // ON CONFLICT DO NOTHING: la consulta que genera la muestra puede repetir
      // un cliente que tenga varios locales, porque numera por cliente-local. Se
      // ignora el duplicado en vez de arreglar la consulta, para que el
      // importador aguante cualquier muestra sin exigir que venga perfecta.
      const sql = `INSERT INTO erp.${t} (${cols.join(',')}) VALUES (${marcas})
                   ON CONFLICT DO NOTHING`;
      let metidas = 0;
      for (const f of filas) {
        metidas += (await cliente.query(sql, cols.map((c) => f[c]))).rowCount;
      }
      const repes = filas.length - metidas;
      console.log('  ' + t.padEnd(18) + String(metidas).padStart(6) +
        (repes ? '   (' + repes + ' duplicadas en la muestra, ignoradas)' : ''));
    }

    // Las plantas de la app que falten, a partir de las secciones del ERP.
    //
    // plants.code ya coincide con seccion_id, y el logotipo se llama igual que
    // el codigo. En produccion las cuatro existen; una base de desarrollo recien
    // creada suele tener solo una, y entonces la utilidad de listados sale sin
    // nombre de planta y con el logotipo generico.
    for (const s of datos.secciones || []) {
      await cliente.query(
        `INSERT INTO plants (code, name, active, logo_path)
         VALUES ($1::text, $2, true, $1::text || '.jpg')
         ON CONFLICT (code) DO UPDATE SET active = true,
           logo_path = coalesce(plants.logo_path, EXCLUDED.logo_path)`,
        [s.seccion_id, s.nombre]);
    }

    // La frescura, para que el pie del PDF lleve la fecha de los precios.
    await cliente.query('TRUNCATE erp.datasets');
    for (const d of datos.datasets || []) {
      await cliente.query(
        `INSERT INTO erp.datasets (dataset, ultima_ejecucion, filas, checksum, modo)
         VALUES ($1,$2,$3,$4,$5)`,
        [d.dataset, d.ultima_ejecucion, d.filas, d.checksum, d.modo]);
    }

    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }

  // --- Que se puede probar con esto ---
  const r = await pool.query(`
    SELECT c.secpref_id AS planta,
           count(DISTINCT c.cliente_id)::int AS clientes,
           count(DISTINCT v.vendedor_id)::int AS vendedores
      FROM erp.clientes c
      JOIN erp.cli_env e ON e.empresa_id=c.empresa_id AND e.cliente_id=c.cliente_id AND e.activo
      JOIN erp.cltes_rutas_vta cr ON cr.empresa_id=e.empresa_id AND cr.cliente_id=e.cliente_id
                                 AND cr.local_id=e.local_id AND cr.origen_id='0' AND cr.activo
      JOIN erp.rutas_venta ru ON ru.empresa_id=cr.empresa_id AND ru.ruta_ventas_id=cr.ruta_venta_id
                             AND ru.seccion_id=c.secpref_id AND ru.activo
      JOIN erp.vendedores v ON v.empresa_id=ru.empresa_id AND v.seccion_id=ru.seccion_id
                           AND v.vendedor_id=ru.vendedor_id AND v.activo
                           AND v.baja=false AND v.activoreal=true
     WHERE c.activo AND c.estado=false
     GROUP BY 1 ORDER BY 1`);
  const a = await pool.query(`
    SELECT s.seccion_id, count(*)::int AS articulos
      FROM erp.articulos_sec s JOIN erp.articulos ar
        ON ar.empresa_id=s.empresa_id AND ar.articulo_id=s.articulo_id AND ar.activo
     WHERE s.activo AND s.status=0 AND s.vta_tpv=true AND s.precio_vta>0
       AND coalesce(ar.quitar_catalogo,false)=false
     GROUP BY 1 ORDER BY 1`);
  const porSeccion = new Map(a.rows.map((x) => [x.seccion_id, x.articulos]));

  console.log('\n  Lo que queda utilizable:');
  for (const f of r.rows) {
    console.log('    ' + f.planta + '  ' + String(f.clientes).padStart(4) + ' clientes  ' +
      String(f.vendedores).padStart(3) + ' vendedores  ' +
      String(porSeccion.get(f.planta) || 0).padStart(4) + ' articulos');
  }
  console.log('\n  Para entrar hace falta un usuario cuyo correo coincida con el de');
  console.log('  un vendedor. Los hay de verdad en la muestra: mira');
  console.log("    SELECT seccion_id, nombre, email FROM erp.vendedores WHERE baja=false AND activoreal=true;");

  await pool.end();
};

importar().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
