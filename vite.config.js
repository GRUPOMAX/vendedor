// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// nome exato do repo no GitHub
const REPO = 'vendedor'

export default defineConfig({
  base: process.env.GITHUB_PAGES ? `/${REPO}/` : '/', // 👈 base dinâmica
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve('node_modules/react'),
      'react-dom': path.resolve('node_modules/react-dom'),
      // 'preact/compat': path.resolve('node_modules/react'), // se usar
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    // ⬇️ importante: não pré-empacotar lucide-react
    exclude: ['lucide-react'],
    // (opcional) para ser ultra-defensivo:
    // exclude: [/^lucide-react(\/.*)?$/],
  },
})
