require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const mastersRoutes = require('./routes/masters.routes');
const plantsRoutes = require('./routes/plants.routes');
const submissionsRoutes = require('./routes/submissions.routes');
const auditRoutes = require('./routes/audit.routes');
const prospectingRoutes = require('./routes/prospecting.routes');
const utilitiesRoutes = require('./routes/utilities.routes');
const plvCompaniesRoutes = require('./routes/plvCompanies.routes');
const plvArticlesRoutes = require('./routes/plvArticles.routes');
const plvRoutes = require('./routes/plv.routes');
const syncRoutes = require('./routes/sync.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Detrás de Nginx: confiar en el primer proxy para que rate-limit y req.ip
// vean la IP real del cliente vía X-Forwarded-For en vez de 127.0.0.1
app.set('trust proxy', 1);

// Crear directorio de uploads si no existe
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middlewares globales
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));

// Receptor del Sincronizador GNP (Sincronizador GNP/CONTRATO-SYNC.md).
// Se monta ANTES del express.json() global a proposito: los lotes llegan
// comprimidos y pesan mas que el limite por defecto de 100kb, asi que el router
// trae su propio parser. Montado despues, este los rechazaria con un 413.
app.use('/api/sync/v1', syncRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir ficheros subidos
app.use('/uploads', express.static(path.resolve(uploadDir)));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/plants', plantsRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/prospecting', prospectingRoutes);
app.use('/api/utilities', utilitiesRoutes);
app.use('/api/plv-companies', plvCompaniesRoutes);
app.use('/api/plv-articles', plvArticlesRoutes);
app.use('/api/plv', plvRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manejo de errores global
app.use((err, req, res, _next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
