import { describe, expect, it } from 'vitest'

import zeus from '../src'

describe('bundler plugin entry', () => {
  it('exports default as createZeusPlugin', () => {
    expect(typeof zeus).toBe('function')
  })

  it('creates plugin with default options', () => {
    const plugin = zeus()
    expect(plugin.name).toBe('zeus-bundler-plugin')
  })

  it('creates plugin with custom options', () => {
    const plugin = zeus({
      diagnostics: false,
    })
    expect(plugin.name).toBe('zeus-bundler-plugin')
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

  it('accepts output plugins', () => {
    const mockOutput: import('../src').ZeusOutputPlugin = {
      name: 'test-output',
      generateBundle() {
        return [{ type: 'asset', fileName: 'x.json', source: '{}' }]
      },
    }

    const plugin = zeus({
      outputs: [mockOutput],
    })

    expect(plugin.name).toBe('zeus-bundler-plugin')
  })

  it('accepts component include patterns', () => {
    const plugin = zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
    })

    expect(plugin.name).toBe('zeus-bundler-plugin')
  })

  it('accepts compiler options', () => {
    const plugin = zeus({
      compiler: {
        moduleName: 'custom-module',
      },
    })

    expect(plugin.name).toBe('zeus-bundler-plugin')
  })

  it('accepts include/exclude patterns', () => {
    const plugin = zeus({
      include: /\.tsx$/,
      exclude: /node_modules/,
    })

    expect(plugin.name).toBe('zeus-bundler-plugin')
  })
})
