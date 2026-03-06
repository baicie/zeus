import path from 'node:path'
import { defineConfig } from 'vite'
import { vitePlugin } from '@zeus-js/build-tools/vite'

export default defineConfig({
  plugins: [vitePlugin()],
  build: {
    minify: false,
  },
})
