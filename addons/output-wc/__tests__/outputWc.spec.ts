/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import wc from '../src'

import type {
  AnalyzerDiagnostic,
  ComponentManifest,
} from '@zeus-js/component-analyzer'
import type { OutputBundle } from 'rollup'

type ZeusOutputAsset = {
  type: 'asset'
  fileName: string
  source: string
}

function createMockCtx(manifest: ComponentManifest) {
  return {
    manifest,
    root: '/project',
    diagnostics: [] as AnalyzerDiagnostic[],
    emitFile: () => '',
    warn: () => {},
    error: () => {},
    addWatchFile: () => {},
    meta: { watchMode: false },
  }
}

describe('output-wc', () => {
  it('creates plugin with default name', () => {
    const plugin = wc()
    expect(plugin.name).toBe('zeus-output-wc')
  })

  it('creates plugin with custom options', () => {
    const plugin = wc({
      outDir: 'dist/wc',
      manifestFile: 'dist/zeus.components.json',
      customElementsFile: 'dist/custom-elements.json',
      dts: true,
      jsxDts: true,
      stripPrefix: 'z-',
    })

    expect(plugin.name).toBe('zeus-output-wc')
    expect(typeof plugin.buildStart).toBe('function')
    expect(typeof plugin.virtualModules).toBe('function')
    expect(typeof plugin.generateBundle).toBe('function')
  })

  it('supports stripPrefix', () => {
    const plugin = wc({ stripPrefix: 'z-' })
    expect(plugin.name).toBe('zeus-output-wc')
  })

  it('supports custom fileName', () => {
    const plugin = wc({ fileName: tag => `custom-${tag}` })
    expect(plugin.name).toBe('zeus-output-wc')
  })

  it('supports disabling index generation', () => {
    const plugin = wc({ index: false })
    expect(plugin.name).toBe('zeus-output-wc')
  })

  it('supports disabling dts generation', () => {
    const plugin = wc({ dts: false })
    expect(plugin.name).toBe('zeus-output-wc')
  })

  it('supports disabling jsxDts generation', () => {
    const plugin = wc({ jsxDts: false })
    expect(plugin.name).toBe('zeus-output-wc')
  })

  it('supports disabling manifest generation', () => {
    const plugin = wc({ manifestFile: false })
    expect(plugin.name).toBe('zeus-output-wc')
  })

  it('supports disabling custom elements generation', () => {
    const plugin = wc({ customElementsFile: false })
    expect(plugin.name).toBe('zeus-output-wc')
  })

  describe('virtualModules', () => {
    it('generates only index module when manifest has no components (with index enabled)', () => {
      const plugin = wc()
      const ctx = createMockCtx({ version: 1, components: [] })

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result).toHaveLength(1)
      expect(result![0].id).toBe('zeus:wc:index')
      expect(result![0].fileName).toBe('dist/wc/index.js')
    })

    it('generates one virtual module per component plus index', () => {
      const plugin = wc()
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result).toHaveLength(2)
      expect(result![0].id).toBe('zeus:wc:z-button')
      expect(result![0].fileName).toBe('dist/wc/z-button.js')
      expect(result![0].code).toContain('import { ZButton }')
      expect(result![0].code).toContain('export { ZButton }')

      expect(result![1].id).toBe('zeus:wc:index')
      expect(result![1].fileName).toBe('dist/wc/index.js')
    })

    it('respects stripPrefix in fileName', () => {
      const plugin = wc({ stripPrefix: 'z-' })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result![0].fileName).toBe('dist/wc/button.js')
    })

    it('respects custom fileName function', () => {
      const plugin = wc({ fileName: tag => `my-${tag}` })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result![0].fileName).toBe('dist/wc/my-z-button.js')
    })

    it('respects custom outDir', () => {
      const plugin = wc({ outDir: 'web-components' })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result![0].fileName).toBe('web-components/z-button.js')
    })

    it('skips index module when index is false', () => {
      const plugin = wc({ index: false })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result).toHaveLength(1)
      expect(result![0].id).toBe('zeus:wc:z-button')
    })
  })

  describe('generateBundle', () => {
    it('generates default assets even when manifest has no components', () => {
      const plugin = wc()
      const ctx = createMockCtx({ version: 1, components: [] })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]

      expect(result).toHaveLength(4)
      const fileNames = new Set(result.map(f => f.fileName))
      expect(fileNames).toContain('dist/custom-elements.json')
      expect(fileNames).toContain('dist/zeus.components.json')
      expect(fileNames).toContain('dist/wc/index.d.ts')
      expect(fileNames).toContain('dist/wc/jsx.d.ts')
    })

    it('generates all default assets with components', () => {
      const plugin = wc()
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {
              variant: {
                type: 'string',
                values: ['default', 'outline'],
                default: 'default',
                reflect: true,
              },
            },
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]

      expect(result).toHaveLength(4)
      const fileNames = new Set(result.map(f => f.fileName))
      expect(fileNames).toContain('dist/custom-elements.json')
      expect(fileNames).toContain('dist/zeus.components.json')
      expect(fileNames).toContain('dist/wc/index.d.ts')
      expect(fileNames).toContain('dist/wc/jsx.d.ts')
    })

    it('generates zeus.components.json', () => {
      const plugin = wc()
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]
      const manifest = result.find(
        f => f.fileName === 'dist/zeus.components.json',
      )

      expect(manifest).toBeTruthy()
      expect(JSON.parse(manifest!.source as string)).toMatchObject({
        version: 1,
        components: [{ tag: 'z-button' }],
      })
    })

    it('generates custom-elements.json', () => {
      const plugin = wc()
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]
      const customElements = result.find(
        f => f.fileName === 'dist/custom-elements.json',
      )

      expect(customElements).toBeTruthy()
      expect(JSON.parse(customElements!.source as string)).toMatchObject({
        schemaVersion: '1.0.0',
        modules: [
          {
            kind: 'javascript-module',
            path: 'dist/wc/z-button.js',
            declarations: [
              {
                kind: 'class',
                name: 'ZButtonElement',
                tagName: 'z-button',
                customElement: true,
              },
            ],
          },
        ],
      })
    })

    it('generates index.d.ts with HTMLElementTagNameMap', () => {
      const plugin = wc()
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]
      const dts = result.find(f => f.fileName === 'dist/wc/index.d.ts')

      expect(dts).toBeTruthy()
      const dtsSource = (dts!.source as string).toLowerCase()
      expect(dtsSource).toContain('declare global')
      expect(dtsSource).toContain('zbuttonelement')
      expect(dtsSource).toContain('"z-button"')
    })

    it('generates jsx.d.ts with JSX namespace', () => {
      const plugin = wc()
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]
      const jsxDts = result.find(f => f.fileName === 'dist/wc/jsx.d.ts')

      expect(jsxDts).toBeTruthy()
      expect((jsxDts!.source as string).toLowerCase()).toContain('jsx')
    })

    it('respects custom outDir', () => {
      const plugin = wc({ outDir: 'web-components' })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]
      const dts = result.find(f => f.fileName === 'web-components/index.d.ts')

      expect(dts).toBeTruthy()
    })

    it('skips assets when options are disabled', () => {
      const plugin = wc({
        manifestFile: false,
        customElementsFile: false,
        dts: false,
        jsxDts: false,
      })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      const result = plugin.generateBundle!(ctx as any, {} as OutputBundle)

      expect(result).toEqual([])
    })
  })

  describe('buildStart', () => {
    it('warns on file name collision', () => {
      const warns: string[] = []
      const plugin = wc({
        warnOnFileNameCollision: true,
        fileName: () => 'button.js',
      })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button-a.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
          {
            tag: 'z-button-alt',
            name: 'ZButtonAlt',
            exportName: 'ZButtonAlt',
            source: 'src/components/button-b.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      plugin.buildStart!({
        ...ctx,
        warn: (msg: unknown) => warns.push(String(msg)),
      } as any)

      expect(warns.some(w => w.includes('Multiple components'))).toBe(true)
    })

    it('does not warn when warnOnFileNameCollision is false', () => {
      const warns: string[] = []
      const plugin = wc({
        warnOnFileNameCollision: false,
        fileName: () => 'button.js',
      })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button-a.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
          {
            tag: 'z-button-alt',
            name: 'ZButtonAlt',
            exportName: 'ZButtonAlt',
            source: 'src/components/button-b.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      plugin.buildStart!({
        ...ctx,
        warn: (msg: unknown) => warns.push(String(msg)),
      } as any)

      expect(warns).toEqual([])
    })

    it('does not warn on unique file names', () => {
      const warns: string[] = []
      const plugin = wc({ warnOnFileNameCollision: true })
      const ctx = createMockCtx({
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/components/button-a.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
          {
            tag: 'z-button-alt',
            name: 'ZButtonAlt',
            exportName: 'ZButtonAlt',
            source: 'src/components/button-b.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: [],
          },
        ],
      })

      plugin.buildStart!({
        ...ctx,
        warn: (msg: unknown) => warns.push(String(msg)),
      } as any)

      expect(warns).toEqual([])
    })
  })

  describe('rollup integration', () => {
    it('emits wc entries and manifests via real Rollup build', async () => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), 'zeus-output-wc-e2e-'),
      )

      await fs.mkdir(path.join(root, 'src/components'), { recursive: true })

      await fs.writeFile(path.join(root, 'src/index.ts'), `export {}`)

      await fs.writeFile(
        path.join(root, 'src/components/button.tsx'),
        [
          `import { defineElement } from '@zeus-js/zeus'`,
          ``,
          `export const ZButton = defineElement(`,
          `  'z-button',`,
          `  {`,
          `    props: {`,
          `      variant: {`,
          `        type: String,`,
          `        default: 'default',`,
          `        reflect: true,`,
          `      },`,
          `    },`,
          `  },`,
          `  () => null`,
          `)`,
        ].join('\n'),
      )

      const bundle = await rollup({
        input: path.join(root, 'src/index.ts'),
        plugins: [
          (await import('@zeus-js/bundler-plugin')).default({
            root,
            components: {
              include: ['src/components/**/*.{ts,tsx}'],
            },
            outputs: [
              wc({
                outDir: 'wc',
                manifestFile: 'zeus.components.json',
                customElementsFile: 'custom-elements.json',
                dts: true,
                jsxDts: true,
              }),
            ],
          }),
        ],
        onwarn() {},
      })

      const result = await bundle.generate({
        dir: path.join(root, 'dist'),
        format: 'esm',
      })

      const files = result.output.map(item => item.fileName).sort()

      // virtual component entry not emitted (Rollup only emits transitively-referenced chunks)
      expect(files).toContain('wc/index.js')
      expect(files).toContain('wc/index.d.ts')
      expect(files).toContain('wc/jsx.d.ts')
      expect(files).toContain('zeus.components.json')
      expect(files).toContain('custom-elements.json')

      const manifestAsset = result.output.find(
        item =>
          item.type === 'asset' && item.fileName === 'zeus.components.json',
      )

      expect(manifestAsset).toBeTruthy()

      const manifest = JSON.parse(String((manifestAsset as any).source))

      expect(manifest.components[0]).toMatchObject({
        tag: 'z-button',
        props: {
          variant: {
            type: 'string',
            default: 'default',
            reflect: true,
          },
        },
      })

      const customElementsAsset = result.output.find(
        item =>
          item.type === 'asset' && item.fileName === 'custom-elements.json',
      )

      expect(customElementsAsset).toBeTruthy()

      const customElements = JSON.parse(
        String((customElementsAsset as any).source),
      )

      expect(customElements.schemaVersion).toBe('1.0.0')
      expect(customElements.modules[0].declarations[0]).toMatchObject({
        kind: 'class',
        name: 'ZButtonElement',
        tagName: 'z-button',
        customElement: true,
      })

      await bundle.close()
    })
  })
})
