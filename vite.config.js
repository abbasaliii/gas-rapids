import { defineConfig } from 'vite';

// base './' makes the build work from any folder: GitHub Pages sub-path, Netlify, itch.io, a USB stick.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
