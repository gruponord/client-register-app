module.exports = {
  apps: [
    {
      name: 'client-register-api',
      script: 'src/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },

    // Vigilancia de la frescura de la replica del ERP: avisa por correo cuando
    // un dataset lleva horas sin recibir nada. Ver src/jobs/vigilarSync.js.
    //
    // Va como proceso APARTE y de un solo uso, no dentro de la API. Dos razones:
    //
    //   - La API corre en cluster con dos instancias. Un setInterval dentro de
    //     ella se ejecutaria en las dos y cada aviso saldria duplicado.
    //   - Un trabajo que arranca, hace lo suyo y se muere no puede quedarse
    //     colgado ni acumular memoria.
    //
    // `autorestart: false` con `cron_restart` es lo que lo convierte en un
    // temporizador: PM2 lo arranca en punto, el script termina y se queda
    // parado hasta la hora siguiente. En `pm2 list` aparece como `stopped` casi
    // todo el tiempo, y eso es lo normal: no esta caido, esta esperando.
    {
      name: 'client-register-vigila-sync',
      script: 'src/jobs/vigilarSync.js',
      instances: 1,
      exec_mode: 'fork',
      cron_restart: '0 * * * *',
      autorestart: false,
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/vigila-sync-error.log',
      out_file: './logs/vigila-sync.log',
      merge_logs: true,
    },
  ],
};
