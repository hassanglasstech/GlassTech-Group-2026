// Flat ESLint config — intentionally MINIMAL + high-signal.
// The audit (God-mode 2026-07) flagged "no ESLint safety net" as a repeated
// gap: the duplicate 'GlassCo' literal, ~1,395 `any`, and react-hooks-order
// bugs all shipped because nothing caught them. This config adds the guardrail
// without drowning a 4/10 codebase in thousands of legacy warnings — so it
// stays USABLE as a real gate. Ratchet more rules on over time.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'supabase/functions/**', // Deno runtime, different globals
      'server/**',
      'scripts/**',
      '**/*.config.*',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.base], // TS parser + plugin, NO opinionated rules
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // ERROR — the class of bug the audit actually found (guards moved after
      // hooks / conditional hooks). Must never regress.
      'react-hooks/rules-of-hooks': 'error',
      // WARN — high-value but noisy on legacy code; surfaced, not blocking.
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn', // ratchet toward 0
    },
  },
);
