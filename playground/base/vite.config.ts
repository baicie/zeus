import { defineConfig } from 'vite'
import zeusPlugin from '@zeus-js/vite-plugin-zeus'

export default defineConfig({
  plugins: [zeusPlugin()],
})
