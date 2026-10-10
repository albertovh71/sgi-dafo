import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' + llamadas a la API relativas: la app funciona montada en cualquier subruta (p. ej. dentro de VISTA).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': process.env.SGI_API ?? 'http://127.0.0.1:8096' },
  },
})
