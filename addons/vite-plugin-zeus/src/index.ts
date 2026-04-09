/* eslint-disable no-restricted-syntax */
import type { FilterPattern, Plugin } from 'vite'
import { createFilter } from 'vite'
import * as babel from '@babel/core'
import { mergeAndConcat } from 'merge-anything'
import type { CompilerOptions } from '@zeus-js/compiler'
import zeusJSXPlugin from '@zeus-js/compiler'

export interface Options {
  /**
   * A [picomatch](https://github.com/micromatch/picomatch) pattern, or array of patterns, which specifies the files
   * the plugin should operate on.
   */
  include?: FilterPattern
  /**
   * A [picomatch](https://github.com/micromatch/picomatch) pattern, or array of patterns, which specifies the files
   * to be ignored by the plugin.
   */
  exclude?: FilterPattern
  /**
   * Pass any additional babel transform options. They will be merged with
   * the transformations required by Solid.
   *
   * @default {}
   */
  babel?:
    | babel.TransformOptions
    | ((source: string, id: string, ssr: boolean) => babel.TransformOptions)
    | ((
        source: string,
        id: string,
        ssr: boolean,
      ) => Promise<babel.TransformOptions>)
}

export function zeusVitePlugin(options: Partial<Options> = {}): Plugin {
  const filter = createFilter(options.include, options.exclude)

  let projectRoot: string | undefined = process.cwd()

  const plugin: Plugin = {
    name: 'vite-plugin-zeus',
    config(userConfig) {
      const isRolldownVite = this && 'rolldownVersion' in this.meta
      projectRoot = userConfig.root

      return {
        optimizeDeps: isRolldownVite
          ? {
              rolldownOptions: { transform: { jsx: 'preserve' } },
            }
          : {},
      }
    },
    async transform(code, id) {
      if (!filter(id)) {
        return null
      }

      id = id.replace(/\?.*$/, '')

      if (!/\.[mc]?[tj]sx$/i.test(id)) {
        return null
      }

      // const inNodeModules = /node_modules/.test(id)

      let compilerOptions: CompilerOptions = {
        generate: 'dom',
        hydratable: false,
        moduleName: '@zeus-js/core',
      }

      const shouldBeProcessedWithTypescript = /\.[mc]?tsx$/i.test(id)

      const plugins: NonNullable<
        NonNullable<babel.TransformOptions['parserOpts']>['plugins']
      > = ['jsx']

      if (shouldBeProcessedWithTypescript) {
        plugins.push('typescript')
      }

      const opts: babel.TransformOptions = {
        root: projectRoot,
        filename: id,
        sourceFileName: id,
        plugins: [[zeusJSXPlugin, compilerOptions]],
        ast: false,
        sourceMaps: true,
        configFile: false,
        babelrc: false,
        parserOpts: {
          plugins,
        },
      }

      let babelUserOptions: babel.TransformOptions = {}

      if (options.babel) {
        if (typeof options.babel === 'function') {
          const babelOptions = options.babel(code, id, false)
          babelUserOptions =
            babelOptions instanceof Promise ? await babelOptions : babelOptions
        } else {
          babelUserOptions = options.babel
        }
      }

      const babelOptions = mergeAndConcat(
        babelUserOptions,
        opts,
      ) as babel.TransformOptions

      const result = await babel.transformAsync(code, babelOptions)
      if (!result || !result.code) {
        return null
      }
      return { code: result.code, map: result.map }
    },
  }
  return plugin
}

export default zeusVitePlugin
