import {
  transformAsync as babelTransformAsync,
  transformSync as babelTransformSync,
} from '@babel/core'
import type { CompilerOptions } from './shared/types'
import zeusJSXPlugin from './plugin'

export interface ZeusTransformOptions {
  code: string
  filename?: string
  options?: CompilerOptions
  sourceMaps?: boolean
}

export interface ZeusTransformResult {
  code: string
  /** Babel source map JSON or null when not requested */
  map: import('@babel/core').BabelFileResult['map']
}

const babelOpts = (opts: ZeusTransformOptions) => ({
  filename: opts.filename || 'unknown.tsx',
  presets: [
    [
      '@babel/preset-typescript',
      {
        allExtensions: true,
        isTSX: true,
      },
    ],
  ],
  plugins: [[zeusJSXPlugin, opts.options || {}]],
  configFile: false,
  babelrc: false,
  sourceMaps: opts.sourceMaps ?? false,
})

export function transformSync(opts: ZeusTransformOptions): ZeusTransformResult {
  const result = babelTransformSync(opts.code, babelOpts(opts))
  if (!result || result.code == null) {
    throw new Error('[zeus-jsx] transformSync produced empty output')
  }
  return {
    code: result.code,
    map: result.map == null ? null : result.map,
  }
}

export function transformAsync(
  opts: ZeusTransformOptions,
): Promise<ZeusTransformResult> {
  return babelTransformAsync(opts.code, babelOpts(opts)).then(result => {
    if (!result || result.code == null) {
      throw new Error('[zeus-jsx] transformAsync produced empty output')
    }
    return {
      code: result.code,
      map: result.map == null ? null : result.map,
    }
  })
}
