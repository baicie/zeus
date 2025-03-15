import { transformSync } from '@babel/core'
import type { TransformHook } from 'rollup'
import jsxTransform from 'babel-plugin-jsx-dom-expressions'

export const commonTransform: TransformHook = (code: string, id: string) => {
  if (!/\.[tj]sx$/.test(id)) return null
  if (!code.includes('@Component')) return null

  try {
    const result = transformSync(code, {
      filename: id,
      presets: [
        [
          '@babel/preset-typescript',
          {
            isTSX: true,
            allExtensions: true,
          },
        ],
      ],
      plugins: [
        [
          '@babel/plugin-syntax-decorators',
          {
            version: '2023-11',
            decoratorsBeforeExport: true,
          },
        ],
        jsxTransform({
          moduleName: '@zeus/core',
          builtIns: ['For', 'Show'],
          contextToCustomElements: true,
          wrapConditionals: true,
          generate: 'dom',
        }),
        // createJSXPlugin({
        //   dev: process.env.NODE_ENV !== 'production',
        // }),
      ],
    })

    return (
      result && {
        code: result.code || code,
        map: result.map,
      }
    )
  } catch (error) {
    console.error(`Error transforming ${id}:`, error)
    return null
  }
}
