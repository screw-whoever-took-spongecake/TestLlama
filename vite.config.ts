import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // SPA: dev server serves index.html for non-file routes (e.g. /service/testcase/123) so refresh keeps user on same view
    proxy: {
      // Only proxy API paths so /service/testcase/:id is handled by the SPA
      '/service/projects': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/service/test-cases': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/service/jira': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/service/settings': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/service/attachments': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/service/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/service/test-runs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/service/test-case-folders': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/service/test-run-folders': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
