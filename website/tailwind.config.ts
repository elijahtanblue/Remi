import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        remi: {
          blue: '#244A6A',
          dark: '#2C4261',
          cream: '#FAF7F6',
          ink: '#183047',
          mist: '#E6EDF4',
          slate: '#587089',
          cloud: '#D5DFEA',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 30px 80px rgba(19, 34, 52, 0.22)',
        panel: '0 24px 60px rgba(28, 48, 75, 0.12)',
      },
      backgroundImage: {
        'hero-grid':
          'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
      letterSpacing: {
        hero: '-0.06em',
      },
    },
  },
  plugins: [],
};

export default config;
