import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  define: { __APP_BUILD__: JSON.stringify(process.env.APP_BUILD || '0') },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 1200 }
});
