/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        midnight: {
          base: '#081426',    // Deep Navy
          blue: '#102A43',    // Navy Blue
          surface: '#0B192B', // Dark Surface
          elevated: '#122338',
          border: '#1B3552',
          hover: '#18314C',
        },
        accent: {
          cyan: '#00C2FF',      // Electric Cyan
          teal: '#36D6B0',      // Teal Accent
          ice: '#EAF2F8',       // Ice White
          secondary: '#A8B9CC', // Secondary Text
          muted: '#72869B',     // Muted Text
        },
        risk: {
          critical: '#FF4D5A',
          high: '#FF8A45',
          medium: '#F5C451',
          low: '#36D6B0',
        },
        navy: {
          950: '#081426', // Updated to Deep Navy
          900: '#0B192B', // Updated to Dark Surface
          850: '#102A43', // Updated to Navy Blue
          800: '#152E4A',
          700: '#1B3552',
          600: '#2A5282',
        },
      },
      boxShadow: {
        'cyan-glow': '0 0 20px rgba(0, 194, 255, 0.25)',
        'teal-glow': '0 0 20px rgba(54, 214, 176, 0.25)',
        'critical-glow': '0 0 20px rgba(255, 77, 90, 0.3)',
      },
    },
  },
  plugins: [],
}

