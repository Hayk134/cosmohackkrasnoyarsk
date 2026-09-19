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
        emerald: {
          50: '#f4f6f2',
          100: '#e5ebdf',
          200: '#c8d4be',
          300: '#a5b997',
          400: '#7f9870',
          500: '#5c744f',
          600: '#485c3e',
          700: '#3A4831', // User's EXACT Hero Color: #3A4831
          800: '#2B4023', // User's Dark Swatch Color: #2B4023
          900: '#274934', // User's Pine Swatch Color: #274934
          950: '#141d11',
        },
        primary: {
          50: '#f4f6f2',
          100: '#e5ebdf',
          200: '#c8d4be',
          300: '#a5b997',
          400: '#7f9870',
          500: '#5c744f',
          600: '#485c3e',
          700: '#3A4831',
          800: '#2B4023',
          900: '#274934',
          950: '#141d11',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
