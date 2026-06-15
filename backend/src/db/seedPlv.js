// Carga inicial de empresas / grupos / marcas / articulos PLV desde el Excel
// 'petPLV.xlsx', hoja 'cargaIni'. Idempotente: vacia todas las tablas PLV
// (RESTART IDENTITY CASCADE) antes de insertar.
//
// Uso:
//   node src/db/seedPlv.js [ruta-excel]
// Por defecto busca el Excel en la raiz del proyecto.

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const pool = require('../config/db');

// Codigos cortos para empresas, grupos y marcas. Si aparece algo nuevo en el
// Excel que no este aqui, se autogenera a partir del nombre.
const CODIGO_EMPRESA = {
  'Ayestaran': 'Y',
  'Nord Pirineus': 'N',
  'Zubillaga': 'Z',
};

const CODIGO_GRUPO = {
  'ESTABLECIMIENTO': 'EST',
  'EVENTOS': 'EVT',
};

const CODIGO_MARCA = {
  'SAN MIGUEL': 'SM',
  'ALHAMBRA': 'ALH',
  'LA SALVE': 'LSV',
  'STELLA': 'STL',
  'MAGNA': 'MAG',
  'MSM': 'MSM',
  'MAHOU': 'MAH',
};

const SORT_GRUPO = {
  'ESTABLECIMIENTO': 1,
  'EVENTOS': 2,
};

const codigoAutomatico = (nombre, prefijo) => {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (prefijo + limpio).slice(0, 20);
};

const cargar = async () => {
  const rutaExcel = process.argv[2] || path.resolve(__dirname, '../../../../petPLV.xlsx');
  if (!fs.existsSync(rutaExcel)) {
    console.error('No se encuentra el Excel:', rutaExcel);
    process.exit(1);
  }

  console.log('Leyendo:', rutaExcel);
  const wb = XLSX.readFile(rutaExcel);
  if (!wb.SheetNames.includes('cargaIni')) {
    console.error('La hoja "cargaIni" no existe. Hojas:', wb.SheetNames);
    process.exit(1);
  }

  const filas = XLSX.utils.sheet_to_json(wb.Sheets['cargaIni'], { defval: '' });

  // Recolecta sets unicos manteniendo orden de aparicion.
  const empresasSet = new Map();
  const gruposSet = new Map();
  const marcasSet = new Map();
  for (const f of filas) {
    const emp = (f['Empresa'] || '').toString().trim();
    const grp = (f['Grupo'] || '').toString().trim();
    const mar = (f['Marca'] || '').toString().trim();
    if (emp && !empresasSet.has(emp)) empresasSet.set(emp, true);
    if (grp && !gruposSet.has(grp)) gruposSet.set(grp, true);
    if (mar && !marcasSet.has(mar)) marcasSet.set(mar, true);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Vaciando tablas PLV...');
    await client.query(`
      TRUNCATE plv_submission_lines, plv_submissions,
               plv_articles, plv_company_emails, plv_user_companies,
               plv_companies, plv_brands, plv_groups
      RESTART IDENTITY CASCADE
    `);

    // Insert empresas
    const idEmpresa = {};
    for (const nombre of empresasSet.keys()) {
      const code = CODIGO_EMPRESA[nombre] || codigoAutomatico(nombre, 'C');
      const r = await client.query(
        'INSERT INTO plv_companies (code, name) VALUES ($1, $2) RETURNING id',
        [code, nombre]
      );
      idEmpresa[nombre] = r.rows[0].id;
      console.log(`  empresa: ${nombre} (${code}) -> id ${r.rows[0].id}`);
    }

    // Insert grupos
    const idGrupo = {};
    for (const nombre of gruposSet.keys()) {
      const code = CODIGO_GRUPO[nombre] || codigoAutomatico(nombre, 'G');
      const sort = SORT_GRUPO[nombre] || 99;
      const r = await client.query(
        'INSERT INTO plv_groups (code, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [code, nombre, sort]
      );
      idGrupo[nombre] = r.rows[0].id;
      console.log(`  grupo: ${nombre} (${code}) -> id ${r.rows[0].id}`);
    }

    // Insert marcas
    const idMarca = {};
    for (const nombre of marcasSet.keys()) {
      const code = CODIGO_MARCA[nombre] || codigoAutomatico(nombre, 'M');
      const r = await client.query(
        'INSERT INTO plv_brands (code, name) VALUES ($1, $2) RETURNING id',
        [code, nombre]
      );
      idMarca[nombre] = r.rows[0].id;
      console.log(`  marca: ${nombre} (${code}) -> id ${r.rows[0].id}`);
    }

    // Insert articulos. Dedup por (empresa, code) para evitar choques UNIQUE.
    const insertados = new Set();
    let total = 0, saltados = 0;
    for (const f of filas) {
      const emp = (f['Empresa'] || '').toString().trim();
      const grp = (f['Grupo'] || '').toString().trim();
      const mar = (f['Marca'] || '').toString().trim();
      const cod = (f['Cod Art'] || '').toString().trim();
      const desc = (f['Descripcion'] || f['Descripción'] || '').toString().trim();
      if (!emp || !grp || !cod || !desc) continue;

      const company_id = idEmpresa[emp];
      const group_id = idGrupo[grp];
      const brand_id = mar ? idMarca[mar] : null;
      const dupKey = `${company_id}::${cod}`;
      if (insertados.has(dupKey)) { saltados++; continue; }

      await client.query(
        `INSERT INTO plv_articles (company_id, group_id, brand_id, code, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [company_id, group_id, brand_id, cod, desc]
      );
      insertados.add(dupKey);
      total++;
    }

    await client.query('COMMIT');
    console.log(`\nResumen:`);
    console.log(`  ${empresasSet.size} empresas, ${gruposSet.size} grupos, ${marcasSet.size} marcas`);
    console.log(`  ${total} artículos insertados, ${saltados} duplicados (empresa+código) ignorados`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en carga:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

cargar();
