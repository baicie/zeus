import * as babel from '@babel/core'
import presetTypescript from '@babel/preset-typescript'
import type { OutputOptions, Plugin } from 'rollup'
import { zeusJSXPlugin } from '@zeus-js/compiler'
import type { CompilerOptions } from '@zeus-js/compiler'

export interface ZeusRollupPluginOptions {
  /**
   * A [picomatch](https://github.com/micromatch/picomatch) pattern, or array of patterns, which specifies the files
   * the plugin should operate on.
   */
  include?: RegExp
  /**
   * A [picomatch](https://github.com/micromatch/picomatch) pattern, or array of patterns, which specifies the files
   * to be ignored by the plugin.
   */
  exclude?: RegExp
  /**
   * This will force SSR code in the produced files.
   *
   * @default false
   */
  ssr?: boolean
  /**
   * The output mode of the compiler.
   * Can be:
   * - "dom" is standard output
   * - "ssr" is for server side rendering of strings.
   * - "universal" is for using custom renderers
   *
   * @default "dom"
   */
  generate?: 'dom' | 'ssr' | 'universal'
  /**
   * Indicate whether the output should contain hydratable markers.
   *
   * @default false
   */
  hydratable?: boolean
  /**
   * Pass any additional compiler options for Zeus JSX transformation.
   *
   * @default {}
   */
  options?: CompilerOptions
}

export function zeusRollupPlugin(opts: ZeusRollupPluginOptions = {}): Plugin {
  const {
    include = /\.[jt]sx?$/,
    exclude = /node_modules/,
    ssr = false,
    generate = 'dom',
    hydratable = false,
    options: compilerOptions = {},
  } = opts

  return {
    name: 'zeus-jsx',

    buildStart() {
      // 初始化插件状态
      // 可以在此进行构建前的检查和配置
    },

    renderStart(outputOptions: OutputOptions) {
      // 记录构建信息
      const format = outputOptions.format
      if (ssr || format === 'cjs') {
        // SSR 或 CommonJS 格式需要特殊处理
      }
    },

    transform(code, id) {
      if (exclude.test(id)) {
        return null
      }
      if (!include.test(id)) {
        return null
      }

      // Determine compiler options based on SSR mode
      const finalCompilerOptions: CompilerOptions = Object.assign(
        {},
        { generate, hydratable },
        compilerOptions,
      )

      // Determine parser plugins based on file extension
      const isTSX = /\.[cm]?tsx$/i.test(id)
      const parserPlugins = ['jsx'] as any[]
      if (isTSX) {
        parserPlugins.push('typescript')
      }

      // Call Babel API directly with Zeus plugin
      return babel
        .transformAsync(code, {
          filename: id,
          sourceFileName: id,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          presets: isTSX
            ? [
                [
                  presetTypescript,
                  {
                    allExtensions: true,
                    isTSX: true,
                    onlyRemoveTypeImports: true,
                  },
                ],
              ]
            : [],
          parserOpts: {
            plugins: parserPlugins,
          },
          plugins: [[zeusJSXPlugin, finalCompilerOptions]],
        })
        .then(result => {
          if (!result || !result.code) {
            return null
          }

          return {
            code: result.code,
            map: result.map ? result.map : undefined,
          }
        })
    },
  }
}
