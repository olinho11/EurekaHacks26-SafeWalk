/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Professional Security Palette
        security: {
          blue: '#1A2B3C',
          'blue-light': '#2A3B4C',
          'blue-dark': '#0A1B2C',
        },
        emergency: {
          red: '#D32F2F',
          'red-light': '#E53935',
          'red-dark': '#B71C1C',
        },
        // Safety Tier Colors (Fixed for clarity)
        safe: {
          DEFAULT: '#38D39F',
          light: '#8CF5D1',
          dim: 'rgba(56, 211, 159, 0.12)',
        },
        warn: {
          DEFAULT: '#F0B429',
          light: '#FFD875',
          dim: 'rgba(240, 180, 41, 0.12)',
        },
        danger: {
          DEFAULT: '#FF5C6C',
          light: '#FF8F99',
          dim: 'rgba(255, 92, 108, 0.12)',
        },
        // Neutral Palette
        neutral: {
          50: '#F5F7FA',
          100: '#E6ECF5',
          200: '#D1DBE8',
          300: '#A0B4CC',
          400: '#6B7E99',
          500: '#4A5568',
          600: '#2D3748',
          700: '#1A202C',
          800: '#131B25',
          900: '#0D1117',
          950: '#07090E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'system-ui', '-apple-system', 'sans-serif'],
      },
      spacing: {
        // 8px grid system
        '0.5': '4px',
        '1': '8px',
        '1.5': '12px',
        '2': '16px',
        '2.5': '20px',
        '3': '24px',
        '4': '32px',
        '5': '40px',
        '6': '48px',
        '8': '64px',
        '10': '80px',
        '12': '96px',
      },
      minHeight: {
        'tap': '44px', // Minimum tap target
      },
      minWidth: {
        'tap': '44px', // Minimum tap target
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.5' }],
        'sm': ['0.875rem', { lineHeight: '1.5' }],
        'base': ['1rem', { lineHeight: '1.5' }],
        'lg': ['1.125rem', { lineHeight: '1.4' }],
        'xl': ['1.25rem', { lineHeight: '1.3' }],
        '2xl': ['1.5rem', { lineHeight: '1.2' }],
        '3xl': ['1.875rem', { lineHeight: '1.1' }],
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '8px',
        'lg': '12px',
      },
      boxShadow: {
        'professional': '0 2px 8px rgba(0, 0, 0, 0.15)',
        'elevated': '0 4px 16px rgba(0, 0, 0, 0.2)',
        'critical': '0 8px 32px rgba(211, 47, 47, 0.3)',
      },
    },
  },
  plugins: [],
}
