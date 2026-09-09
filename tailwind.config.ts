import type { Config } from 'tailwindcss';

export default {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
          900: '#14532D',
        },
        positive: { DEFAULT: '#22C55E', light: '#DCFCE7' },
        negative: { DEFAULT: '#EF4444', light: '#FEE2E2' },
      },
      animation: {
        'flash-green': 'flashGreen 300ms ease-out',
        'flash-red': 'flashRed 300ms ease-out',
      },
      keyframes: {
        flashGreen: {
          '0%': { backgroundColor: 'rgba(34, 197, 94, 0.35)', color: '#4ade80' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashRed: {
          '0%': { backgroundColor: 'rgba(239, 68, 68, 0.35)', color: '#f87171' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
