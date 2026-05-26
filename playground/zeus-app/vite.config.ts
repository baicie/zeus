import { defineConfig } from 'vite'
import { zeus } from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
