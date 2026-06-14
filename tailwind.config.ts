import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cobalt: '#1d4ed8',
        'cobalt-deep': '#0b2e8a',
        signal: '#e11d2a',
        neon: '#ffd400',
        slate: '#334155',
        panel: '#ffffff',
        ink: '#0b1220',
      },
      fontFamily: {
        display: ['Anton', 'Impact', 'Haettenschweiler', 'Arial Narrow Bold', 'sans-serif'],
        body: ['Arial', 'Verdana', 'Helvetica', 'sans-serif'],
      },
      boxShadow: {
        hard: '4px 4px 0 0 rgba(11,18,32,1)',
        'hard-sm': '2px 2px 0 0 rgba(11,18,32,1)',
        'hard-lg': '6px 6px 0 0 rgba(11,18,32,1)',
      },
    },
  },
  plugins: [],
};

export default config;
