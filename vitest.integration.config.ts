import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vitest/config';

// ── Load .env.test (if present) into the test process ────────────────────
// Integration tests read SUPABASE_TEST_* to reach the LOCAL Supabase stack.
// Falls back to the standard local demo keys (see integrationClient.ts) when
// .env.test is absent, so a default `supabase start` works with zero config.
const loadEnvTest = (): Record<string, string> => {
  const out: Record<string, string> = {};
  const file = path.resolve(process.cwd(), '.env.test');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
};

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    // These hit a real Postgres — Node env (no jsdom), longer timeout.
    environment: 'node',
    include: ['modules/**/*.integration.test.ts', 'src/**/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Serialise: the tests share one local DB and seed/reset around each other.
    fileParallelism: false,
    env: loadEnvTest(),
  },
});
