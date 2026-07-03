/** @type {import('tailwindcss').Config} */
// Build-time Tailwind — replaces the runtime cdn.tailwindcss.com Play CDN, which
// compiled CSS in the browser on every load (slow on list-heavy pages + FOUC,
// e.g. buttons rendering as plain text until the CSS was generated).
//
// BEHAVIOUR-NEUTRAL: `theme.extend` is an exact copy of the inline
// `tailwind.config` that used to live in index.html, so the generated utilities
// match what the CDN produced — the app should look identical, just load faster.
//
// `content` must list EVERY file that uses Tailwind classes, or the build purges
// their classes and styling breaks. If any area looks unstyled after this, add
// its directory here.
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx,js,jsx}',
    './modules/**/*.{ts,tsx,js,jsx}',
    './pages/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}',
    './data/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
    },
  },
  plugins: [],
}
