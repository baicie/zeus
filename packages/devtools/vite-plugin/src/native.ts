import { createRequire } from 'node:module'

import type { SourceMapInput } from 'rollup'

const require = createRequire(import.meta.url)

export const { transformModule } = require('@zeus-js/compiler-native') as {
  transformModule: (options: {
    source: string
    filename: string
    target: 'dom' | 'ssr'
    runtimeModule: string
    delegateEvents: boolean
    sourceMap: boolean
    hmr?: boolean
  }) => {
    code: string
    map: SourceMapInput | null
    diagnostics: Array<{
      code: string
      message: string
      severity: 'error' | 'warning'
      filename: string
      span?: { start: { line: number; column: number } }
    }>
  }
}
