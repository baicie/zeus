// examples/counter/vite.config.ts

import { defineConfig } from 'vite'
import zeusPlugin from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeusPlugin()],
})
