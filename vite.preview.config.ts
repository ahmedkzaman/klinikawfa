/**
 * Dev-only vite config for the Insight visual verification harness.
 * Builds insight-preview.html as a static bundle (no HMR, no react-refresh
 * preamble) so it can be screenshotted from file:// without a dev server.
 * Usage: npx vite build --config vite.preview.config.ts
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-preview',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        preview: fileURLToPath(new URL('./insight-preview.html', import.meta.url)),
      },
    },
  },
});
