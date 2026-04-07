import type { Plugin } from 'vite'
import type { CompilerOptions } from '@zeus-js/compiler'
import { transformSync } from '@zeus-js/compiler'

export interface ZeusVitePluginOptions {
  options?: CompilerOptions
  include?: RegExp
  exclude?: RegExp
}

export function zeusVitePlugin(opts: ZeusVitePluginOptions = {}): Plugin {
  const {
    options: compilerOptions = {},
    include = /\.[jt]sx?$/,
    exclude = /node_modules/,
  } = opts

  return {
    name: 'zeus-jsx',

    transform(code, id) {
      if (exclude.test(id)) {
        return null
      }
      if (!include.test(id)) {
        return null
      }
      const result = transformSync({
        code,
        filename: id,
        options: compilerOptions,
      })
      return {
        code: result.code,
        map: result.map === null ? undefined : result.map,
      }
    },

    handleHotUpdate() {
      // Placeholder: hook fine-grained HMR when compiler exposes dependency graph
    },
  }
}
