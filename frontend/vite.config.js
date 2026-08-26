import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // Logotipos de planta: los sirve el backend y los usa la cabecera de la
      // utilidad de listados. Sin esto, en desarrollo se veria roto.
      '/logos': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
