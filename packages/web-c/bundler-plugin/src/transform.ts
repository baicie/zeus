import { transformAsync } from '@babel/core'
import transformTypeScript from '@babel/plugin-transform-typescript'
import zeusCompiler from '@zeus-js/compiler'

import { cleanUrl, isTypeScriptLike } from './filter'

import type { PluginItem } from '@babel/core'
import type { CompilerOptions } from '@zeus-js/compiler'

export interface TransformZeusOptions {
  id: string
  code: string
  compiler?: Partial<CompilerOptions> | false
  sourcemap?: boolean
  transpile?: boolean
}

export async function transformZeus(
  options: TransformZeusOptions,
): Promise<{ code: string; map: unknown } | null> {
  const { id, code, compiler, sourcemap = true, transpile = false } = options

  const filename = cleanUrl(id)
  const isTs = isTypeScriptLike(id)

  const shouldRunCompiler = compiler !== false
  const shouldStripTs = transpile && isTs

  if (!shouldRunCompiler && !shouldStripTs) {
    return null
  }

  const compilerOptions =
    compiler === false ? {} : compiler === undefined ? {} : compiler

  const plugins: PluginItem[] = []

  if (shouldRunCompiler) {
    plugins.push([
      zeusCompiler as unknown as (api: object, opts: object) => object,
      {
        moduleName: compilerOptions.moduleName ?? '@zeus-js/runtime-dom',
        generate: 'dom',
        hydratable: false,
        delegateEvents: true,
        ...compilerOptions,
      } satisfies Partial<CompilerOptions>,
    ])
  }

  if (shouldStripTs) {
    plugins.push([
      transformTypeScript as unknown as (api: object, opts: object) => object,
      {},
    ])
  }

  const result = await transformAsync(code, {
    filename,
    sourceMaps: sourcemap,
    plugins,
    parserOpts: {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    },
    generatorOpts: {
      retainLines: false,
      compact: false,
      jsescOption: {
        minimal: true,
      },
    },
  })

  if (!result?.code) return null

  return {
    code: result.code,
    map: result.map,
  }
}
