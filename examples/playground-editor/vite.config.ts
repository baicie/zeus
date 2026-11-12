import { fileURLToPath, URL } from 'node:url'

import zeus from '@zeus-js/vite-plugin'
import { defineConfig } from 'vite'

// The sandbox document may be served under a path prefix (production mounts it
// at /zeus-sandbox/). Absolute asset URLs would escape that prefix, so the
// sandbox entry rewrites them to paths relative to its own directory.
function relativeSandboxAssets() {
  return {
    name: 'zeus-relative-sandbox-assets',
    enforce: 'post' as const,
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, context: { filename?: string }) {
        if (!context.filename?.endsWith('sandbox.html')) return html
        return html
          .replaceAll('src="/assets/', 'src="./assets/')
          .replaceAll('href="/assets/', 'href="./assets/')
      },
    },
  }
}

export default defineConfig({
  plugins: [zeus(), relativeSandboxAssets()],
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
      output: {
        /**
         * Name the two vendor chunks that would otherwise inherit a misleading
         * filename.
         *
         * Before this, Rolldown named the React + ReactDOM + Vue chunk after
         * the *first* shared module it saw and emitted
         * `runtime-dom.esm-bundler-<hash>.js`. The Playground therefore shipped
         * two files called "runtime-dom": the real Zeus runtime (84 KB) and a
         * 252 KB React/Vue bundle. Every size report and every reader of the
         * network panel had to rediscover which was which, and the WebC studio
         * preview — the only consumer of React and Vue — paid for them on the
         * sandbox path, not the main one.
         *
         * Naming them explicitly makes the network panel, the build output and
         * the size audit agree on what each file is. It changes no bytes and no
         * loading order.
         */
        manualChunks(id: string) {
          if (
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react'
          }
          if (id.includes('/@vue/') || id.includes('/vue/dist/')) {
            return 'vendor-vue'
          }
          return undefined
        },
      },
    },
  },
})
