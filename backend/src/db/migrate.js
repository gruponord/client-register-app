require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const ejecutarMigraciones = async () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  const archivos = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Encontradas ${archivos.length} migraciones`);

  for (const archivo of archivos) {
    console.log(`Ejecutando: ${archivo}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, archivo), 'utf-8');
    try {
      await pool.query(sql);
      console.log(`  OK: ${archivo}`);
    } catch (err) {
      console.error(`  ERROR en ${archivo}:`, err.message);
      process.exit(1);
    }
  }

  console.log('Migraciones completadas');
  await pool.end();
};

ejecutarMigraciones();
