import type { PluginObj } from '@babel/core'
import syntaxJsx from '@babel/plugin-syntax-jsx'
import type { CompilerOptions } from './shared/types'
import { mergeConfig } from './config'
import { postprocess } from './transform/postprocess'
import { type ZeusPluginPass, preprocess } from './transform/preprocess'
import { transformJSX } from './transform/jsx'

export default function zeusJSXPlugin(
  _api: unknown,
  options?: CompilerOptions,
): PluginObj<ZeusPluginPass> {
  const resolved = mergeConfig(options || {})

  return {
    name: 'zeus-jsx',
    inherits: syntaxJsx,
    visitor: {
      Program: {
        enter(path, state) {
          preprocess(path, resolved, state)
        },
        exit(path, state) {
          postprocess(path, state)
        },
      },
      JSXElement(path, state) {
        transformJSX(path, state)
      },
      JSXFragment(path, state) {
        transformJSX(path, state)
      },
    },
  }
}
