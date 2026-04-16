// Zeus compiler for Vite plugin

import { transformSync } from '@babel/core'
import zeusBabelPlugin from '@zeusjs/compiler-babel'

export interface TransformOptions {
  dev?: boolean
  sourceMap?: boolean
  runtimeModule?: string
}

export interface TransformResult {
  code: string
  map?: any
  diagnostics?: any[]
}

export const zeusCompiler = {
  transform(
    code: string,
    id: string,
    options: TransformOptions = {}
  ): TransformResult {
    const {
      dev = true,
      sourceMap = false,
    } = options

    try {
      const result = transformSync(code, {
        filename: id,
        plugins: [
          [zeusBabelPlugin, {
            development: dev,
          }],
        ],
        sourceMaps: sourceMap,
        ast: false,
        compact: !dev,
      })

      return {
        code: result?.code || code,
        map: result?.map,
      }
    } catch (error) {
      throw new Error(`Zeus compilation failed for ${id}: ${error}`)
    }
  },

  transformAsync(
    code: string,
    id: string,
    options: TransformOptions = {}
  ): Promise<TransformResult> {
    const {
      dev = true,
      sourceMap = false,
    } = options

    return import('@babel/core').then(({ transform }) => {
      try {
        const result = transform(code, {
          filename: id,
          plugins: [
            [zeusBabelPlugin, {
              development: dev,
            }],
          ],
          sourceMaps: sourceMap,
          ast: false,
          compact: !dev,
        })

        return {
          code: result?.code || code,
          map: result?.map,
        }
      } catch (error) {
        throw new Error(`Zeus compilation failed for ${id}: ${error}`)
      }
    })
  },
}

export function injectRuntimeImports(code: string, helpers: string[]): string {
  if (helpers.length === 0) return code

  const importStatement = `import { ${helpers.join(', ')} } from '@zeusjs/runtime-dom';\n`

  // Find the last import statement
  const lastImportMatch = code.match(/^import\s+.*?from\s+['"].*?['"];?\n/gm)

  if (lastImportMatch) {
    const lastImport = lastImportMatch[lastImportMatch.length - 1]
    const lastImportIndex = code.lastIndexOf(lastImport)
    const insertIndex = lastImportIndex + lastImport.length

    return code.slice(0, insertIndex) + importStatement + code.slice(insertIndex)
  }

  // No imports found, add at the beginning
  return importStatement + code
}
