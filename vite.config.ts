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
        // Test-rebuild: also collect src/** so SyncService (src/services) and other
        // engine-level code can be regression-tested where it lives.
        include: [
          'modules/**/*.test.ts', 'modules/**/*.test.tsx', 'modules/**/*.spec.ts',
          'src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts',
        ],
        coverage: {
          provider: 'v8',
          reporter: ['text-summary', 'json-summary', 'html'],
          reportsDirectory: './coverage',
          include: ['modules/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
          exclude: [
            '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/__tests__/**',
            'modules/shared/testing/**', '**/*.d.ts', 'supabase/**',
          ],
          // Per-file gates on the critical, fully-unit-tested pure money modules.
          // These MUST stay green in CI; the rest of the app is reported (not yet
          // gated) so coverage can ratchet up file-by-file as real tests land.
          thresholds: {
            'modules/finance/services/glBalance.ts':               { statements: 90, branches: 80, functions: 90, lines: 90 },
            'modules/production/services/pieceStatusMachine.ts':    { statements: 90, branches: 80, functions: 90, lines: 90 },
            'modules/hr/services/payrollAccrual.ts':               { statements: 90, branches: 80, functions: 90, lines: 90 },
          },
        },
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
