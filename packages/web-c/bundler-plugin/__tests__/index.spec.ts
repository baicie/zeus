import { describe, expect, it } from 'vitest'

import zeus from '../src'

describe('bundler plugin entry', () => {
  it('exports default as zeus plugin factory', () => {
    expect(typeof zeus).toBe('function')
  })

  it('creates plugin with default options', () => {
    const plugin = zeus()
    expect(plugin.name).toBe('rollup-plugin-zeus')
  })

  it('creates plugin with custom options', () => {
    const plugin = zeus({
      diagnostics: false,
    })
    expect(plugin.name).toBe('rollup-plugin-zeus')
    expect(typeof plugin.transform).toBe('function')
  })

  it('has all required hooks', () => {
    const plugin = zeus()

    expect(typeof plugin.name).toBe('string')
    expect(typeof plugin.buildStart).toBe('function')
    expect(typeof plugin.resolveId).toBe('function')
    expect(typeof plugin.load).toBe('function')
    expect(typeof plugin.transform).toBe('function')
    expect(typeof plugin.generateBundle).toBe('function')
  })

  it('accepts plugins', () => {
    const mockPlugin = {
      name: 'test-plugin',
      generateBundle() {
        return [{ type: 'asset' as const, fileName: 'x.json', source: '{}' }]
      },
    }

    const plugin = zeus({
      plugins: [mockPlugin],
    })

    expect(plugin.name).toBe('rollup-plugin-zeus')
  })

  it('accepts component include patterns', () => {
    const plugin = zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
    })

    expect(plugin.name).toBe('rollup-plugin-zeus')
  })

  it('accepts compiler options', () => {
    const plugin = zeus({
      compiler: {
        moduleName: 'custom-module',
      },
    })

    expect(plugin.name).toBe('rollup-plugin-zeus')
  })

  it('accepts dts option', () => {
    const plugin = zeus({
      dts: false,
    })

    expect(plugin.name).toBe('rollup-plugin-zeus')
  })
})
