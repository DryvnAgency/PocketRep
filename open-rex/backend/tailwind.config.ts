import type { Config } from 'tailwindcss';

// Rex Lens palette — pink→purple gradient on dark ink. Matches Rex Lens
// extension login screen + PocketRep ink/grey scale.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08080b',
          900: '#0c0c0e',
          800: '#141418',
          700: '#1e1e26',
          600: '#2a2a33',
          500: '#3a3a45',
        },
        rex: {
          pink: '#e05272',
          pink2: '#ff5d7f',
          purple: '#7a4dff',
          purple2: '#9d4dff',
        },
        mute: {
          100: '#e8eaf0',
          200: '#b8beca',
          300: '#8e94a4',
          400: '#5e6472',
        },
        success: '#42b883',
        warning: '#f0c060',
        danger: '#e05252',
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'rex-gradient': 'linear-gradient(90deg, #e05272 0%, #7a4dff 100%)',
        'rex-gradient-soft': 'linear-gradient(135deg, rgba(224,82,114,0.18) 0%, rgba(122,77,255,0.18) 100%)',
      },
      boxShadow: {
        'rex-glow': '0 0 0 1px rgba(122,77,255,0.35), 0 8px 40px -10px rgba(224,82,114,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
