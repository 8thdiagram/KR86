import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { offlineBuild } from './scripts/offline-build';

// A transferred standalone project defaults to /. Managed preview injects its own prefix and port.
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port <= 0) throw new Error('Invalid PORT');
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss(), offlineBuild()],
  root: import.meta.dirname,
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  build: { outDir: 'dist/public', emptyOutDir: true, sourcemap: false },
  server: { port, strictPort: true, host: '0.0.0.0', allowedHosts: true },
  preview: {
    port, strictPort: true, host: '0.0.0.0', allowedHosts: true,
    headers: { 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff' },
  },
});
