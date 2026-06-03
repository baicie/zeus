import { afterEach, describe, expect, it, vi } from 'vitest'

import zeus from '../src/vite'

describe('vite adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates plugin with enforce pre', () => {
    const plugin = zeus()

    expect(plugin.name).toBe('vite-plugin-zeus')
    expect(plugin.enforce).toBe('pre')
    expect(typeof plugin.transform).toBe('function')
    expect(typeof plugin.config).toBe('function')
    expect(typeof plugin.configResolved).toBe('function')
    expect(typeof plugin.buildStart).toBe('function')
    expect(typeof plugin.resolveId).toBe('function')
    expect(typeof plugin.load).toBe('function')
    expect(typeof plugin.generateBundle).toBe('function')
  })

  it('accepts diagnostics option', () => {
    const plugin = zeus({ diagnostics: false })

    expect(plugin.name).toBe('vite-plugin-zeus')
    expect(plugin.enforce).toBe('pre')
  })

  it('accepts compiler options', () => {
    const plugin = zeus({
      compiler: {
        moduleName: 'custom-runtime',
      },
    })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })

  it('accepts components include/exclude options', () => {
    const plugin = zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
        exclude: ['**/*.test.*'],
      },
    })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })

  it('accepts dts option', () => {
    const plugin = zeus({ dts: false })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })

  it('accepts plugins option', () => {
    const plugin = zeus({
      plugins: [
        {
          name: 'test-plugin',
          setup() {},
        },
      ],
    })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })

  it('accepts transpile option', () => {
    const plugin = zeus({ transpile: true })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })

  it('accepts resolveExtensions option', () => {
    const plugin = zeus({
      resolveExtensions: ['.ts', '.tsx'],
    })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })

  it('accepts root option as string', () => {
    const plugin = zeus({ root: '/path/to/project' })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })

  it('accepts root option as function', () => {
    const plugin = zeus({ root: () => '/path/to/project' })

    expect(plugin.name).toBe('vite-plugin-zeus')
  })
})
