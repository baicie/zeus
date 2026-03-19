import { defineConfig } from 'vite'
import { viteSimple } from '@zeus-js/build-tools'

export default defineConfig({
  plugins: [viteSimple()],
  build: {
    minify: false,
  },
})
