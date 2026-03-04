import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // 直接走 workspace 源码，避免依赖 dist 产物是否已生成
      '@zeus-js/web-components': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/web-components/src/index.ts',
      ),
      '@zeus-js/runtime-dom': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/runtime-dom/src/index.ts',
      ),
      '@zeus-js/runtime-core': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/runtime-core/src/index.ts',
      ),
      '@zeus-js/signal': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/signal/src/index.ts',
      ),
      '@zeus-js/shared': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/shared/src/index.ts',
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
