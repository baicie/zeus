import { fileURLToPath, URL } from 'node:url'

import zeus from '@zeus-js/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [zeus()],
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
