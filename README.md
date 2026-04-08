# Client Register App - Alta de Clientes

Aplicación web para que los comerciales de **Grupo Nord Pirineus** registren altas de clientes nuevos. Incluye un formulario de inserción y un panel de administración.

**Producción:** https://altas.gruponord.com

## Stack Tecnológico

- **Backend:** Node.js + Express.js
- **Frontend:** React.js + Vite + TailwindCSS
- **Base de datos:** PostgreSQL
- **Servidor:** Nginx (reverse proxy) + SSL (Let's Encrypt)
- **Procesos:** PM2 (cluster mode, 2 instancias)
- **Email:** Nodemailer (SMTP Office365)
- **Auth:** JWT (access token 1h + refresh token 7d) + bcrypt
- **Uploads:** Multer (almacenamiento en disco)

## Requisitos Previos

- Node.js >= 18
- PostgreSQL >= 14
- Nginx
- PM2 (`npm install -g pm2`)
- Certbot (para SSL)

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/gruponord/client-register-app.git
cd client-register-app
```

### 2. Configurar la base de datos

```bash
sudo -u postgres psql -c "CREATE DATABASE client_register;"
```

### 3. Configurar el backend

```bash
cd backend
npm install

# Crear archivo .env a partir del ejemplo
cp .env.example .env

# Editar .env con los valores reales:
# - PORT: puerto del backend (3002 en producción)
# - DATABASE_URL: conexión a PostgreSQL
# - JWT_SECRET y JWT_REFRESH_SECRET: claves seguras aleatorias
# - SMTP_*: datos del servidor de correo
# - CORS_ORIGIN: URL del frontend en producción
# - UPLOAD_DIR: directorio para ficheros subidos

# Ejecutar migraciones (crea todas las tablas)
npm run migrate

# Ejecutar seed (crea usuario admin: admin / admin123)
npm run seed
```

### 4. Configurar el frontend

```bash
cd ../frontend
npm install
```

## Desarrollo Local

### Iniciar backend

```bash
cd backend
npm run dev
# Servidor en http://localhost:3002
```

### Iniciar frontend

```bash
cd frontend
npm run dev
# Aplicación en http://localhost:5173
```

El proxy de Vite redirige `/api` y `/uploads` al backend automáticamente.

### Credenciales iniciales

- **Usuario:** admin
- **Contraseña:** admin123

## Despliegue en Producción

### Servidor actual

- **IP:** 217.154.183.218 (IONOS)
- **Dominio:** altas.gruponord.com
- **Puerto backend:** 3002
- **Ruta app:** /var/www/client-register-app

### Actualizar la aplicación

```bash
# Conectar al servidor
ssh root@217.154.183.218

# Actualizar código
cd /var/www/client-register-app
git pull

# Si hay cambios en backend (dependencias o migraciones)
cd backend
npm install
npm run migrate

# Rebuild frontend
cd ../frontend
npm install
npm run build

# Reiniciar backend
pm2 restart client-register-api
```

### Despliegue desde cero

#### 1. Build del frontend

```bash
cd frontend
npm run build
```

#### 2. Configurar Nginx

```bash
cp nginx/app.conf /etc/nginx/sites-available/altas.gruponord.com
ln -s /etc/nginx/sites-available/altas.gruponord.com /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

#### 3. Configurar SSL con Certbot

```bash
certbot --nginx -d altas.gruponord.com --non-interactive --agree-tos --email admin@gruponord.com
```

#### 4. Iniciar backend con PM2

```bash
cd backend
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Auto-inicio en boot
```

#### 5. Verificar

```bash
pm2 status
pm2 logs client-register-api
curl https://altas.gruponord.com/api/health
```

## Estructura del Proyecto

```
client-register-app/
├── backend/
│   ├── src/
│   │   ├── config/db.js          # Pool PostgreSQL
│   │   ├── controllers/          # Lógica de negocio (auth, users, masters, plants, submissions, audit)
│   │   ├── middlewares/          # Auth JWT, auditoría auto, uploads Multer, validaciones
│   │   ├── routes/               # Rutas API
│   │   ├── services/             # Email (Nodemailer) y ficheros
│   │   └── db/
│   │       ├── migrations/       # SQL numerados (001_init, 002_seeds, 003_password_reset)
│   │       ├── migrate.js        # Script de migraciones
│   │       └── seed.js           # Seed usuario admin
│   ├── uploads/                  # Ficheros subidos (gitignored)
│   ├── ecosystem.config.js       # Config PM2
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/           # AdminLayout, ProtectedRoute, FormField, DataTable
│   │   ├── context/              # AuthContext (JWT + refresh automático)
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── ForgotPasswordPage.jsx
│   │   │   ├── ResetPasswordPage.jsx
│   │   │   ├── FormPage.jsx      # Formulario principal de altas
│   │   │   ├── SuccessPage.jsx
│   │   │   └── admin/            # Dashboard, Users, Masters, Plants, Submissions, Audit
│   │   └── services/api.js       # Axios con interceptors JWT
│   └── public/logo_GNP.jpg
└── nginx/app.conf
```

## Módulos

### Formulario (cualquier usuario autenticado)
- Formulario de alta de cliente con 30 campos (validación frontend y backend)
- Campos tipo select cargados desde tablas maestras
- Subida de ficheros adjuntos (imágenes, PDF, Word, max 10MB)
- Envío automático de email HTML con todos los datos + adjuntos a los emails de la planta
- Diseño responsive (móvil y desktop), estilo Microsoft Forms

### Panel de Administración (solo rol admin)
- Dashboard con estadísticas (total altas, usuarios, plantas)
- CRUD de usuarios (crear, editar, activar/desactivar — sin eliminar)
- CRUD de maestros genérico (comerciales, acciones, clases, facturación, pago, periodos)
- Gestión de plantas con emails de notificación (visibles en tabla)
- Consulta de respuestas con filtros, detalle expandible y exportación a Excel
- Log de auditoría con filtros por usuario, acción, entidad y rango de fechas

### Seguridad
- JWT con access/refresh tokens
- bcrypt para passwords (salt 12)
- Rate limiting en login (5/15min) y submissions (10/min)
- Helmet para headers HTTP
- Validación con express-validator en todos los inputs
- Recuperación de contraseña por email (token válido 1h)
- Auditoría automática de todas las operaciones CRUD y logins

## API Endpoints

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| POST | /api/auth/login | Iniciar sesión | Público |
| POST | /api/auth/refresh | Refrescar token | Público |
| POST | /api/auth/forgot-password | Solicitar reset de contraseña | Público |
| POST | /api/auth/reset-password | Restablecer contraseña con token | Público |
| GET | /api/auth/me | Datos del usuario actual | Autenticado |
| POST | /api/auth/change-password | Cambiar contraseña | Autenticado |
| GET/POST/PUT | /api/users | CRUD usuarios | Admin |
| GET | /api/masters/:tabla | Listar maestro | Autenticado |
| POST/PUT | /api/masters/:tabla | Crear/editar maestro | Admin |
| GET/POST/PUT | /api/plants | CRUD plantas | Admin (escritura) |
| GET/POST/DELETE | /api/plants/:id/emails | Gestión emails planta | Admin |
| GET | /api/submissions | Listar altas (paginado + filtros) | Admin |
| GET | /api/submissions/:id | Detalle de alta con ficheros | Autenticado |
| POST | /api/submissions | Crear alta (multipart/form-data) | Autenticado |
| GET | /api/audit | Log de auditoría (paginado + filtros) | Admin |
| GET | /api/health | Health check | Público |

## Email

- **SMTP:** Office365 (smtp.office365.com:587)
- **Remitente:** noreply@gruponord.com
- Los emails de notificación de altas se envían a todos los emails configurados en la planta
- El usuario que registra el alta recibe copia (CC)
- El email incluye logo de Grupo Nord Pirineus y tabla HTML con todos los campos
