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
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              // Vendor chunks
              if (id.includes('node_modules/react') || id.includes('node_modules/react-dom'))
                return 'vendor-react';
              if (id.includes('node_modules/recharts') || id.includes('node_modules/d3'))
                return 'vendor-charts';
              if (id.includes('node_modules/@supabase'))
                return 'vendor-supabase';
              if (id.includes('node_modules/xlsx') || id.includes('node_modules/jspdf'))
                return 'vendor-office';
              if (id.includes('node_modules/'))
                return 'vendor-misc';
              // App chunks by module
              if (id.includes('/modules/finance/'))   return 'app-finance';
              if (id.includes('/modules/hr/'))         return 'app-hr';
              if (id.includes('/modules/sales/'))      return 'app-sales';
              if (id.includes('/modules/production/')) return 'app-production';
              if (id.includes('/modules/procurement/'))return 'app-procurement';
              if (id.includes('/modules/factory/'))    return 'app-factory';
            },
          }
        },
        chunkSizeWarningLimit: 1000,
      }
    };
});
