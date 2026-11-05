import { fileURLToPath, URL } from 'node:url'

import zeus from '@zeus-js/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [zeus()],
  server: {
    proxy: {
      '/api/': {
        target:
          process.env.ZEUS_ADMIN_API_ORIGIN ??
          (process.env.ZEUS_ADMIN_API_PORT
            ? `http://127.0.0.1:${process.env.ZEUS_ADMIN_API_PORT}`
            : 'http://127.0.0.1:8787'),
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      '@zeus-js/devtools-consumer': fileURLToPath(
        new URL(
          '../../packages/devtools/consumer/src/index.ts',
          import.meta.url,
        ),
      ),
    },
  },
})
