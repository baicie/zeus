import { createRequire } from 'node:module'

import type { Plugin } from 'vitest/config'

const { transformModule } = createRequire(import.meta.url)(
  '../../packages/core/compiler-native/index.js',
) as typeof import('../../packages/core/compiler-native/index.js')

/** JSDOM component tests execute DOM output, even though Vitest loads via SSR. */
export function compileTestViews(): Plugin {
  return {
    name: 'zeus-compile-test-views',
    enforce: 'pre',
    transform(source, id) {
      const filename = id.replace(/[?#].*$/, '')
      if (
        !filename.includes('/examples/headless/src/') ||
        !filename.endsWith('.tsx')
      )
        return null
      const result = transformModule({
        source,
        filename,
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
        delegateEvents: true,
        sourceMap: true,
        hmr: false,
      })
      const diagnostic = result.diagnostics.find(
        entry => entry.severity === 'error',
      )
      if (diagnostic)
        this.error({
          message: `${diagnostic.code}: ${diagnostic.message}`,
          id: filename,
          loc: diagnostic.span
            ? {
                line: diagnostic.span.start.line,
                column: diagnostic.span.start.column,
              }
            : undefined,
        })
      return { code: result.code, map: result.map }
    },
  }
}
