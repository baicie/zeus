import { describe, expect, it } from 'vitest'

import manifestOutput from '../src/outputPlugins/manifest'

import type { ZeusOutputAsset } from '../src/types'
import type { ZeusBuildContext } from '@zeus-js/bundler-plugin'
import type { OutputBundle, RollupError } from 'rollup'

function createMockCtx(): ZeusBuildContext {
  return {
    manifest: {
      version: 1,
      components: [],
    },
    root: '/project',
    diagnostics: [],
    emitFile: () => '',
    warn: () => {},
    error: (_err: string | RollupError) => {
      throw _err
    },
    addWatchFile: () => {},
    meta: { watchMode: false },
    output: {
      outDir: '',
      wcDir: 'wc',
      reactDir: 'react',
      vueDir: 'vue',
      iconsDir: 'icons',
      stripPrefix: false,
      dts: true,
    },
    paths: {
      getFileName: (tag: string) => `${tag}.js`,
      getDir: (kind: string) => kind,
      join: (kind: string, fileName: string) => `${kind}/${fileName}`,
      relativeImport: () => '../wc/file.js',
    },
  }
}

describe('manifest output plugin', () => {
  it('creates plugin with default name', () => {
    const plugin = manifestOutput()
    expect(plugin.name).toBe('zeus-output-manifest')
  })

  it('creates plugin with custom options', () => {
    const plugin = manifestOutput({
      fileName: 'custom.json',
      pretty: false,
    })

    expect(plugin.name).toBe('zeus-output-manifest')
    expect(typeof plugin.generateBundle).toBe('function')
  })

  it('generateBundle returns asset with default filename', () => {
    const plugin = manifestOutput()
    const mockCtx = createMockCtx()

    const result = plugin.generateBundle!(
      mockCtx,
      {} as OutputBundle,
    ) as ZeusOutputAsset[]

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('asset')
    expect(result[0].fileName).toBe('zeus.components.json')
  })

  it('generateBundle returns asset with custom filename', () => {
    const plugin = manifestOutput({ fileName: 'components.json' })
    const mockCtx = createMockCtx()

    const result = plugin.generateBundle!(
      mockCtx,
      {} as OutputBundle,
    ) as ZeusOutputAsset[]

    expect(result[0].fileName).toBe('components.json')
  })

  it('generateBundle outputs pretty JSON by default', () => {
    const plugin = manifestOutput()
    const mockCtx = createMockCtx()

    const result = plugin.generateBundle!(
      mockCtx,
      {} as OutputBundle,
    ) as ZeusOutputAsset[]
    const source = result[0].source as string

    expect(source).toContain('\n')
  })

  it('generateBundle outputs compact JSON when pretty is false', () => {
    const plugin = manifestOutput({ pretty: false })
    const mockCtx = createMockCtx()

    const result = plugin.generateBundle!(
      mockCtx,
      {} as OutputBundle,
    ) as ZeusOutputAsset[]
    const source = result[0].source as string

    expect(source).not.toContain('\n')
    expect(source).toContain('"version":1')
  })
})
