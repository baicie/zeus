import { fileURLToPath, URL } from 'node:url'

import zeus from '@zeus-js/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [zeus()],
  server: {
    headers: {
      // Opaque-origin module workers and iframes request scripts with Origin: null.
      'Access-Control-Allow-Origin': '*',
    },
  },
  preview: {
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        webc: fileURLToPath(new URL('./webc.html', import.meta.url)),
        host: fileURLToPath(new URL('./host.html', import.meta.url)),
        sandbox: fileURLToPath(new URL('./sandbox.html', import.meta.url)),
      },
    },
  },
})
