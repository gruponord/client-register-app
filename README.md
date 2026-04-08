# Client Register App - Alta de Clientes

Aplicación web para que los comerciales registren altas de clientes nuevos. Incluye un formulario de inserción y un panel de administración.

## Stack Tecnológico

- **Backend:** Node.js + Express.js
- **Frontend:** React.js + Vite + TailwindCSS
- **Base de datos:** PostgreSQL
- **Servidor:** Nginx (reverse proxy)
- **SSL:** Certbot (Let's Encrypt)
- **Procesos:** PM2
- **Email:** Nodemailer
- **Auth:** JWT (access + refresh tokens)

## Requisitos Previos

- Node.js >= 18
- PostgreSQL >= 14
- Nginx (para producción)
- PM2 (`npm install -g pm2`)

## Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd client-register-app
```

### 2. Configurar la base de datos

```bash
# Crear la base de datos en PostgreSQL
psql -U postgres -c "CREATE DATABASE client_register;"
```

### 3. Configurar el backend

```bash
cd backend

# Instalar dependencias
npm install

# Crear archivo .env a partir del ejemplo
cp .env.example .env

# Editar .env con tus valores reales:
# - DATABASE_URL: conexión a tu PostgreSQL
# - JWT_SECRET y JWT_REFRESH_SECRET: claves seguras aleatorias
# - SMTP_*: datos de tu servidor de correo
# - CORS_ORIGIN: URL de tu frontend en producción

# Ejecutar migraciones (crea las tablas)
npm run migrate

# Ejecutar seed (crea usuario admin: admin / admin123)
npm run seed
```

### 4. Configurar el frontend

```bash
cd ../frontend

# Instalar dependencias
npm install
```

## Desarrollo

### Iniciar backend (modo desarrollo)

```bash
cd backend
npm run dev
# Servidor en http://localhost:3001
```

### Iniciar frontend (modo desarrollo)

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

### 1. Build del frontend

```bash
cd frontend
npm run build
# Genera la carpeta dist/
```

### 2. Configurar Nginx

```bash
# Copiar configuración
sudo cp nginx/app.conf /etc/nginx/sites-available/client-register
sudo ln -s /etc/nginx/sites-available/client-register /etc/nginx/sites-enabled/

# Editar el archivo y cambiar:
# - server_name por tu dominio
# - rutas de certificados SSL
# - root del frontend al path correcto

# Verificar y recargar
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Configurar SSL con Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
```

### 4. Iniciar backend con PM2

```bash
cd backend
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Para auto-inicio en boot
```

### 5. Verificar

```bash
pm2 status
pm2 logs client-register-api
```

## Estructura del Proyecto

```
client-register-app/
├── backend/              # API REST (Express.js)
│   ├── src/
│   │   ├── config/       # Configuración de BD
│   │   ├── controllers/  # Lógica de negocio
│   │   ├── middlewares/  # Auth, auditoría, uploads, validación
│   │   ├── routes/       # Rutas de la API
│   │   ├── services/     # Email y ficheros
│   │   └── db/           # Migraciones y seeds
│   └── uploads/          # Ficheros subidos (gitignored)
├── frontend/             # SPA (React + Vite)
│   └── src/
│       ├── components/   # Componentes reutilizables
│       ├── context/      # Contexto de autenticación
│       ├── pages/        # Páginas (formulario + admin)
│       └── services/     # Cliente API (axios)
└── nginx/                # Configuración Nginx
```

## Módulos

### Formulario (cualquier usuario autenticado)
- Formulario completo de alta de cliente con 31 campos
- Validación frontend y backend
- Subida de ficheros adjuntos
- Envío de email automático a los destinatarios de la planta

### Panel de Administración (solo rol admin)
- Dashboard con estadísticas
- CRUD de usuarios (crear, editar, activar/desactivar)
- CRUD de maestros (plantas, comerciales, acciones, clases, facturación, pago, periodos)
- Gestión de emails por planta (notificaciones)
- Consulta de respuestas con detalle y exportación Excel
- Log de auditoría con filtros

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Iniciar sesión |
| POST | /api/auth/refresh | Refrescar token |
| GET | /api/auth/me | Datos del usuario actual |
| GET/POST/PUT | /api/users | CRUD usuarios (admin) |
| GET/POST/PUT | /api/masters/:tabla | CRUD maestros |
| GET/POST/PUT | /api/plants | CRUD plantas |
| POST/DELETE | /api/plants/:id/emails | Gestión emails planta |
| GET/POST | /api/submissions | Consultar/crear altas |
| GET | /api/audit | Log de auditoría (admin) |
