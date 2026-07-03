/** @type {import('tailwindcss').Config} */
// Build-time Tailwind — replaces the runtime cdn.tailwindcss.com Play CDN.
//
// The theme below is the CANONICAL design-token set, adopted verbatim from the
// standalone Glassco app (branch `glassco`), which is the single source of truth
// kept in sync with the CSS vars in index.css. The multitenant migration had
// dropped this config entirely (it ran on the CDN with only fonts configured),
// so every semantic token — colors incl. `neutral`, the `fg` variants, the
// `label`/`body` font sizes, the `control`/`card` radii, and the z-index scale —
// silently produced no CSS. Adopting the full config repairs them app-wide.
//
// `content` must list EVERY file that uses Tailwind classes (incl. .ts —
// statusColors.ts returns class strings), or the build purges them.
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
      colors: {
        primary: { DEFAULT: '#2563eb', hover: '#1d4ed8', subtle: '#eff6ff', border: '#bfdbfe', fg: '#ffffff' },
        success: { DEFAULT: '#059669', subtle: '#ecfdf5', border: '#a7f3d0', fg: '#ffffff' },
        warning: { DEFAULT: '#d97706', subtle: '#fffbeb', border: '#fde68a', fg: '#ffffff' },
        danger:  { DEFAULT: '#e11d48', subtle: '#fff1f2', border: '#fecdd3', fg: '#ffffff' },
        info:    { DEFAULT: '#2563eb', subtle: '#eff6ff', border: '#bfdbfe', fg: '#ffffff' },
        neutral: { DEFAULT: '#64748b', subtle: '#f1f5f9', border: '#e2e8f0', fg: '#ffffff' },
      },
      fontSize: {
        '2xs':  ['0.6875rem', { lineHeight: '1rem' }],     // 11px floor
        label:  ['0.75rem',   { lineHeight: '1rem' }],     // 12px
        body:   ['0.875rem',  { lineHeight: '1.25rem' }],  // 14px
      },
      borderRadius: {
        control: '0.5rem',   // 8px — buttons/inputs/pills
        card:    '0.75rem',  // 12px — cards/panels
      },
      letterSpacing: { tightest: '-0.04em' },
      zIndex: {
        sticky: '10', nav: '30', dropdown: '40', overlay: '50',
        panel: '200', sheet: '300', modalLow: '400', modal: '500',
        popover: '600', top: '1000',
      },
    },
  },
  plugins: [],
}
