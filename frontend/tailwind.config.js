/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          'dark-blue':    '#05204a',
          'energic-blue': '#1574ff',
          'light-blue':   '#e9f3ff',
          'white-gray':   '#f7f7f7',
          'purple':       '#ce93db',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        funnel: ['"Funnel Display"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
