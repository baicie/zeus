import {
  transformAsync as babelTransformAsync,
  transformSync as babelTransformSync,
} from '@babel/core'
import plugin from './plugin'

export interface CompilerTransformRequest {
  code: string
  filename?: string
  options?: any
}

export interface CompilerTransformResult {
  code: string
  map: any
}

function normalizeInput(
  input: string | CompilerTransformRequest,
  maybeOptions?: any,
): { code: string; options: any } {
  if (typeof input === 'string') {
    return { code: input, options: maybeOptions || {} }
  }
  return {
    code: input.code,
    options: Object.assign(
      {},
      input.options || {},
      input.filename ? { filename: input.filename } : {},
    ),
  }
}

export function transformSync(
  input: string | CompilerTransformRequest,
  maybeOptions: any = {},
): CompilerTransformResult {
  const normalized = normalizeInput(input, maybeOptions)
  const base = Object.assign({}, normalized.options)
  const plugins = (normalized.options.plugins || []).slice()
  plugins.push(plugin())
  ;(base as any).plugins = plugins
  ;(base as any).configFile = false
  ;(base as any).babelrc = false
  ;(base as any).sourceMaps = true
  const result = babelTransformSync(normalized.code, base)
  return {
    code: (result && result.code) || '',
    map: (result && result.map) || null,
  }
}

export function transformAsync(
  input: string | CompilerTransformRequest,
  maybeOptions: any = {},
): Promise<CompilerTransformResult> {
  const normalized = normalizeInput(input, maybeOptions)
  const base = Object.assign({}, normalized.options)
  const plugins = (normalized.options.plugins || []).slice()
  plugins.push(plugin())
  ;(base as any).plugins = plugins
  ;(base as any).configFile = false
  ;(base as any).babelrc = false
  ;(base as any).sourceMaps = true
  return babelTransformAsync(normalized.code, base).then(result => ({
    code: (result && result.code) || '',
    map: (result && result.map) || null,
  }))
}
