import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served under /access by the Node server; dev proxies the API to :8080.
export default defineConfig({
  base: '/access/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/access/api': 'http://localhost:8080'
    }
  }
});
