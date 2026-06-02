import { describe, expect, it } from 'vitest'

import zeus, { mergeExternal } from '../src/vite'

describe('vite plugin', () => {
  it('creates vite plugin with expected name', () => {
    const plugin = zeus()

    expect(plugin.name).toBe('vite-plugin-zeus')
  })

  it('sets enforce to pre', () => {
    const plugin = zeus()

    expect(plugin.enforce).toBe('pre')
  })

  it('has transform function', () => {
    const plugin = zeus()

    expect(typeof plugin.transform).toBe('function')
  })

  it('has config hook', () => {
    const plugin = zeus()

    expect(typeof plugin.config).toBe('function')
  })

  it('has configResolved hook', () => {
    const plugin = zeus()

    expect(typeof plugin.configResolved).toBe('function')
  })

  it('has buildStart hook', () => {
    const plugin = zeus()

    expect(typeof plugin.buildStart).toBe('function')
  })

  it('has resolveId hook', () => {
    const plugin = zeus()

    expect(typeof plugin.resolveId).toBe('function')
  })

  it('has load hook', () => {
    const plugin = zeus()

    expect(typeof plugin.load).toBe('function')
  })

  it('has generateBundle hook', () => {
    const plugin = zeus()

    expect(typeof plugin.generateBundle).toBe('function')
  })

  it('creates plugin with diagnostics option', () => {
    const plugin = zeus({ diagnostics: false })

    expect(plugin.name).toBe('vite-plugin-zeus')
    expect(plugin.enforce).toBe('pre')
  })

  it('creates plugin with compiler options', () => {
    const plugin = zeus({
      compiler: {
        moduleName: 'custom',
      },
    })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })
})

describe('mergeExternal', () => {
  it('returns plugin externals when no user external', () => {
    const result = mergeExternal(undefined, ['@zeus-js/core', 'react'])

    expect(result).toEqual(['@zeus-js/core', 'react'])
  })

  it('merges string user external with plugin externals', () => {
    const result = mergeExternal('lodash', ['@zeus-js/core'])

    expect(result).toEqual(['lodash', '@zeus-js/core'])
  })

  it('merges array user external with plugin externals', () => {
    const result = mergeExternal(['lodash', 'rxjs'], ['@zeus-js/core'])

    expect(result).toEqual(['lodash', 'rxjs', '@zeus-js/core'])
  })

  it('wraps function user external with plugin externals', () => {
    const userFn = (src: string) => src === 'lodash'
    const result = mergeExternal(userFn, ['@zeus-js/core'])

    expect(typeof result).toBe('function')

    const fn = result as (
      source: string,
      importer: string | undefined,
      isResolved: boolean,
    ) => boolean

    expect(fn('lodash', undefined, false)).toBe(true)
    expect(fn('rxjs', undefined, false)).toBe(false)
    expect(fn('@zeus-js/core', undefined, false)).toBe(true)
    expect(fn('@zeus-js/core', undefined, false)).toBe(true)
  })
})
