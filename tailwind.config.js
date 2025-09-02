/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Usa a classe 'dark' para alternar o tema
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Modo claro
        background: '#f4f4f5', // zinc-100
        text: '#18181b', // zinc-900
        border: '#d4d4d8', // zinc-300
        card: '#ffffff', // branco
        // Modo escuro
        'dark-background': '#18181b', // zinc-950
        'dark-text': '#e4e4e7', // zinc-100
        'dark-border': '#3f3f46', // zinc-700
        'dark-card': '#27272a', // zinc-800
      },
    },
  },
  plugins: [],
};