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
      // Semantic tokens used across the app (bg-primary, bg-primary-subtle,
      // text-primary-fg, border-danger-border, bg-success-subtle, …) that were
      // NEVER defined — under the CDN they produced no CSS, so those elements
      // rendered unstyled (e.g. `bg-primary text-white` = white text on nothing
      // = invisible "buttons that are just text" on the quotation editor).
      // Values follow the app's existing --sap-* palette in index.css.
      colors: {
        primary: { DEFAULT: '#2563eb', subtle: '#eff6ff', hover: '#1d4ed8', border: '#bfdbfe', fg: '#ffffff' },
        success: { DEFAULT: '#059669', subtle: '#ecfdf5', border: '#a7f3d0' },
        danger:  { DEFAULT: '#e11d48', subtle: '#fff1f2', border: '#fecdd3' },
        warning: { DEFAULT: '#d97706', subtle: '#fffbeb', border: '#fde68a' },
        info:    { DEFAULT: '#2563eb', subtle: '#eff6ff', border: '#bfdbfe' },
      },
      // Semantic z-index scale (z-dropdown/z-popover/z-overlay/z-modal/z-top) —
      // used app-wide but NEVER defined, so under the CDN every one produced no
      // z-index. That's why full-screen overlays like the Glassco quotation
      // editor (`fixed inset-0 ... z-top`) failed to cover the Sales module tabs,
      // and why modals/dropdowns could stack wrong. Ordered low→high.
      zIndex: {
        dropdown: '1000',
        popover:  '1100',
        overlay:  '1200',
        modal:    '1300',
        top:      '9999',
      },
    },
  },
  plugins: [],
}
