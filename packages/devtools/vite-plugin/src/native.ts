import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import type { SourceMapInput } from 'rollup'

const require = createRequire(import.meta.url)

export const compilerVersion = readCompilerVersion()

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

function readCompilerVersion(): string {
  try {
    const entry = require.resolve('@zeus-js/compiler-native')
    const packageJSON = path.join(path.dirname(entry), 'package.json')
    const packageData = JSON.parse(readFileSync(packageJSON, 'utf8')) as {
      version?: unknown
    }
    return typeof packageData.version === 'string'
      ? packageData.version
      : 'unknown'
  } catch {
    return 'unknown'
  }
}
