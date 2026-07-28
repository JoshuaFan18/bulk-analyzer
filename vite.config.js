import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Every 64px domain icon is under the 4KB default, so Vite would base64 all
    // fourteen into the main JS chunk — roughly 52KB of it, re-downloaded on
    // every app change. They are a stable set that repeats hundreds of times per
    // page, so emit them as hashed files the browser caches once instead.
    // `undefined` keeps the default limit for everything else.
    assetsInlineLimit: (filePath) => (filePath.includes('assets/icons/') ? false : undefined),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5175',
    },
  },
});
