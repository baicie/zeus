import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import zeus from '../src'
import { defineZeusRolldownConfig } from '../src/rolldown'
import rolldownZeus from '../src/rolldown'
import { defineZeusRollupConfig } from '../src/rollup'

import type { Plugin } from 'rolldown'

type RolldownTestPlugin = Plugin & {
  options(options: { external?: unknown }): { external?: unknown }
  outputOptions(opts: Record<string, unknown>): Record<string, unknown> | null
}

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

  it('merges component plugin externals into Rollup config', () => {
    const config = defineZeusRollupConfig({
      external: ['lodash'],
      zeus: {
        plugins: [
          {
            name: 'react-output',
            external: ['react'],
          },
        ],
      },
    })

    expect(config.external).toEqual(['lodash', /^@zeus-js\//, 'react'])
  })

  it('merges component plugin externals into Rolldown config', () => {
    const config = defineZeusRolldownConfig({
      external: ['lodash'],
      zeus: {
        plugins: [
          {
            name: 'vue-output',
            external: ['vue'],
          },
        ],
      },
    })

    expect(config.external).toEqual(['lodash', /^@zeus-js\//, 'vue'])
  })

  it('externalizes Zeus runtime packages in Rollup config helpers', () => {
    const config = defineZeusRollupConfig()

    expect(config.external).toEqual([/^@zeus-js\//])
  })

  it('places generated Rollup chunks under chunks by default', () => {
    const config = defineZeusRollupConfig()

    expect(config.output).toMatchObject({
      dir: 'dist',
      chunkFileNames: 'chunks/[name]-[hash].js',
    })
  })

  it('externalizes Zeus runtime packages in Rolldown config helpers', () => {
    const config = defineZeusRolldownConfig()

    expect(config.external).toEqual([/^@zeus-js\//])
  })

  it('places generated Rolldown chunks under chunks by default', () => {
    const config = defineZeusRolldownConfig()

    expect(config.output).toMatchObject({
      dir: 'dist',
      chunkFileNames: 'chunks/[name]-[hash].js',
    })
  })

  it('merges externals from the Rolldown plugin options hook', () => {
    const plugin = rolldownZeus({
      plugins: [
        {
          name: 'vue-output',
          external: ['vue'],
        },
      ],
    }) as RolldownTestPlugin

    const options = plugin.options({
      external: ['lodash'],
    })

    expect(options.external).toEqual(['lodash', /^@zeus-js\//, 'vue'])
  })

  it('places generated chunks under chunks from the Rolldown plugin output hook', () => {
    const plugin = rolldownZeus() as RolldownTestPlugin

    expect(plugin.outputOptions({ format: 'esm' })).toMatchObject({
      format: 'esm',
      chunkFileNames: 'chunks/[name]-[hash].js',
    })
  })

  it('does not override explicit Rolldown chunk file names', () => {
    const plugin = rolldownZeus() as RolldownTestPlugin

    expect(
      plugin.outputOptions({
        format: 'esm',
        chunkFileNames: 'assets/[name].js',
      }),
    ).toBeNull()
  })

  it('cleans the default output directory from the Rolldown plugin output hook', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-clean-'))
    const staleFile = path.join(root, 'dist', 'stale.js')
    fs.mkdirSync(path.dirname(staleFile), { recursive: true })
    fs.writeFileSync(staleFile, 'stale')

    const plugin = rolldownZeus({ root }) as RolldownTestPlugin

    plugin.outputOptions({ format: 'esm' })

    expect(fs.existsSync(staleFile)).toBe(false)
  })

  it('keeps the output directory when clean is false', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-clean-'))
    const staleFile = path.join(root, 'dist', 'stale.js')
    fs.mkdirSync(path.dirname(staleFile), { recursive: true })
    fs.writeFileSync(staleFile, 'stale')

    const plugin = rolldownZeus({ root, clean: false }) as RolldownTestPlugin

    plugin.outputOptions({ format: 'esm' })

    expect(fs.existsSync(staleFile)).toBe(true)
  })

  it('honors transpile true in Rolldown adapter', async () => {
    const plugin = rolldownZeus({
      transpile: true,
    })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>

    const result = await transform(
      'export interface Props { label: string }\nexport const label: string = "ok"',
      '/src/plain.ts',
    )

    expect(result).toBeTruthy()
    expect(result?.code).not.toContain('interface Props')
    expect(result?.code).not.toContain(': string')
  })
})
