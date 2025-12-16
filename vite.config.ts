import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Maps the 'process.env' identifier to 'window.process.env' at build time.
    // 'window.process.env' is a valid entity name for esbuild, whereas '({})' was failing.
    'process.env': 'window.process.env'
  }
});