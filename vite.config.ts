import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // This allows the build to proceed even if process.env is referenced in the code,
    // relying on the polyfill in index.html at runtime.
    'process.env': '({})'
  }
});