require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const ejecutarSeed = async () => {
  try {
    // Generar hash real con bcrypt
    const passwordHash = await bcrypt.hash('admin123', 12);

    await pool.query(
      `INSERT INTO users (username, password_hash, email, full_name, role)
       VALUES ('admin', $1, 'admin@example.com', 'Administrador', 'admin')
       ON CONFLICT (username) DO UPDATE SET password_hash = $1`,
      [passwordHash]
    );

    console.log('Seed ejecutado: usuario admin creado/actualizado (admin / admin123)');
    await pool.end();
  } catch (err) {
    console.error('Error en seed:', err);
    process.exit(1);
  }
};

ejecutarSeed();
