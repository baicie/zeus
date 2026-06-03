// @ts-expect-error - @babel/core lacks types in this workspace
import { transformAsync } from '@babel/core'
// @ts-expect-error - @babel/preset-typescript lacks types
import presetTypeScript from '@babel/preset-typescript'
import zeusCompiler from '@zeus-js/compiler'

import type { CompilerOptions } from '@zeus-js/compiler'

export interface TransformZeusOptions {
  id: string
  code: string
  compiler?: Partial<CompilerOptions>
  sourcemap?: boolean
  transpile?: boolean
}

export async function transformZeus(options: TransformZeusOptions) {
  const { id, code, compiler, sourcemap = true, transpile = false } = options

  const isTs = /\.[cm]?tsx?$/.test(id)
  const isTsx = /\.[cm]?tsx$/.test(id)

  const result = await transformAsync(code, {
    filename: id,
    sourceMaps: sourcemap,

    plugins: [
      [
        zeusCompiler,
        {
          moduleName: compiler?.moduleName ?? '@zeus-js/runtime-dom',
          generate: 'dom',
          hydratable: false,
          delegateEvents: true,
          ...compiler,
        } satisfies Partial<CompilerOptions>,
      ],
    ],

    presets:
      transpile && isTs
        ? [
            [
              presetTypeScript,
              {
                allExtensions: true,
                isTSX: isTsx,
                allowDeclareFields: true,
                onlyRemoveTypeImports: true,
              },
            ],
          ]
        : [],

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
