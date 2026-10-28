import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    hmr: false,
    watch: {
      ignored: [
        '**/data/**',
        '**/backups/**',
        '**/dist/**',
        '**/public/uploads/**'
      ]
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: false
  }
});
