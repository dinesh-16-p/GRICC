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
        navy: {
          950: '#070b16',
          900: '#0b1329',
          850: '#0f1a36',
          800: '#14234b',
          700: '#1e3266',
          600: '#2b4485',
        },
      },
    },
  },
  plugins: [],
}

