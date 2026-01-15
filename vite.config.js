import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Use relative paths for agnostic hosting
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined // Keep everything bundled for PWA simplicity
      }
    }
  },
  server: {
    port: 5679,
    open: true
  }
});
