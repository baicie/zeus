import { fileURLToPath, URL } from 'node:url'

import zeus from '@zeus-js/vite-plugin'
import { defineConfig } from 'vite'

/**
 * Two builds share this config:
 *
 * - production (`pnpm build`): the app talks to `examples/admin/server` over
 *   `/api/`. Unchanged.
 * - demo (`ZEUS_ADMIN_DEMO=1 pnpm build`): the same source, built for GitHub
 *   Pages. `base` moves under the demo path, `VITE_ZEUS_ADMIN_DEMO` switches
 *   the data layer to the build-time snapshot (`src/admin-api.ts`), and a
 *   `404.html` copy of `index.html` lets a deep link survive a refresh — Pages
 *   has no rewrite rule, so without it `/users/grace` would 404 on reload.
 *
 * Nothing about the server build changes; the flag only alters this one
 * output directory.
 */
const demo = process.env.ZEUS_ADMIN_DEMO === '1'
/** The demo lives at `<pages>/admin/` inside the shared `zeus-demos` site. */
const demoBase = process.env.ZEUS_ADMIN_DEMO_BASE ?? '/zeus-demos/admin/'

export default defineConfig({
  plugins: [
    zeus(),
    demo && {
      name: 'zeus-admin-demo-fallback',
      // `closeBundle` runs after the assets are written, so the copy sees the
      // final `index.html` rather than a partial one.
      closeBundle() {
        const dir = this.environment?.config?.build?.outDir
        if (!dir) return
        void import('node:fs/promises').then(({ copyFile }) =>
          copyFile(`${dir}/index.html`, `${dir}/404.html`).catch(() => {}),
        )
      },
    },
  ],
  base: demo ? demoBase : '/',
  define: demo
    ? { 'import.meta.env.VITE_ZEUS_ADMIN_DEMO': JSON.stringify('true') }
    : {},
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
