import type { Plugin } from 'rollup'
import type { CompilerOptions } from '@zeus-js/compiler'
import { transformSync } from '@babel/core'
import presetTypescript from '@babel/preset-typescript'
import zeusJSXPlugin from '@zeus-js/compiler'

export interface ZeusRollupPluginOptions {
  options?: CompilerOptions
  include?: RegExp
  exclude?: RegExp
}

export function zeusRollupPlugin(opts: ZeusRollupPluginOptions = {}): Plugin {
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
      const zeusJSXPluginCompat = function (
        api: unknown,
        options?: Record<string, unknown>,
      ) {
        const plugin = zeusJSXPlugin(api, options) as {
          inherits?: unknown
        }
        if (
          plugin.inherits &&
          typeof plugin.inherits !== 'function' &&
          typeof (plugin.inherits as { default?: unknown }).default ===
            'function'
        ) {
          plugin.inherits = (plugin.inherits as { default: unknown }).default
        }
        return plugin
      }

      const result = transformSync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        presets: [
          [
            presetTypescript,
            { allExtensions: true, isTSX: true, onlyRemoveTypeImports: true },
          ],
        ],
        plugins: [[zeusJSXPluginCompat, compilerOptions]],
      })
      if (!result || !result.code) {
        return null
      }
      return {
        code: result.code,
        map: result.map === null ? undefined : result.map,
      }
    },
  }
}
