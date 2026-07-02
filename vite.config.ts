import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [],
        // Audit #13: was 'modules/__tests__/**' only, which silently DROPPED
        // co-located suites like modules/factory/services/__tests__/*.test.ts
        // (10 real tests never ran). Collect every *.test/*.spec under modules.
        include: ['modules/**/*.test.ts', 'modules/**/*.test.tsx', 'modules/**/*.spec.ts'],
      },
      build: {
        chunkSizeWarningLimit: 5000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/react-dom')) return 'vendor-react-dom';
              if (id.includes('node_modules/react/')) return 'vendor-react';
              if (id.includes('node_modules/d3-')) return 'vendor-d3';
              if (id.includes('node_modules/recharts')) return 'vendor-recharts';
              if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
              if (id.includes('node_modules/')) return 'vendor-misc';
            }
          }
        }
      }
    };
});
