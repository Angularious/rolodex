import type { Config } from 'tailwindcss';

// Palette lifted from tryclean.ai's field gradient + UI:
// near-black bg, warm cream ink, electric-blue accent.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // surfaces
        ink: '#0a0a0b', // page base (darkest)
        'ink-2': '#0d0f14', // raised panels
        // text
        cream: '#f2efe8', // primary text
        'cream-dim': '#cdcabf', // secondary text
        muted: '#9a988f', // tertiary / mono labels
        // accent (theme-swappable via CSS vars — see globals.css)
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-faint': 'var(--accent-faint)',
        // hairlines
        line: 'rgba(242,239,232,0.12)',

        // --- legacy aliases (kept so untouched utilities still read on-theme) ---
        neon: 'var(--accent)',
        signal: 'var(--accent-soft)',
        cobalt: 'var(--accent)',
        'cobalt-deep': '#0d0f14',
        slate: '#9a988f',
        panel: '#0d0f14',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Newsreader', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-display)', 'Space Grotesk', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
