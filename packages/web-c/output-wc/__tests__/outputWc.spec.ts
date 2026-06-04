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

function createMockOutputs(
  outDir = 'wc',
  opts?: { stripPrefix?: string | false; fileName?: (tag: string) => string },
) {
  return {
    register() {},
    has() {
      return false
    },
    get() {
      return {
        outDir,
        stripPrefix: opts?.stripPrefix ?? false,
        fileName: opts?.fileName,
      }
    },
    getDir() {
      return outDir
    },
    getFileName(_kind: string, tag: string) {
      if (opts?.fileName) return opts.fileName(tag)
      let name = tag
      if (opts?.stripPrefix && name.startsWith(opts.stripPrefix)) {
        name = name.slice(opts.stripPrefix.length)
      }
      return `${name}.js`
    },
    join(_kind: string, fileName: string) {
      return `${outDir}/${fileName}`
    },
  }
}

function createMockCtx(
  manifest: ComponentManifest,
  opts?: {
    outDir?: string
    dts?: boolean
    stripPrefix?: string | false
    fileName?: (tag: string) => string
  },
) {
  const outDir = opts?.outDir ?? 'wc'
  return {
    manifest,
    root: '/project',
    diagnostics: [] as AnalyzerDiagnostic[],
    dts: { enabled: opts?.dts ?? true, mode: 'auto' as const, reason: [] },
    outputs: createMockOutputs(outDir, {
      stripPrefix: opts?.stripPrefix,
      fileName: opts?.fileName,
    }),
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
      outDir: 'wc',
      manifestFile: 'zeus.components.json',
      customElementsFile: 'custom-elements.json',
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
    it('uses lazy registration by default', () => {
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
      const ids = result.map((module: any) => module.id)

      expect(ids).toContain('zeus:wc:components.manifest')
      expect(ids).toContain('zeus:wc:loader')
      expect(ids).toContain('zeus:wc:auto')
      expect(ids).toContain('zeus:wc:entry:z-button')
      expect(ids).not.toContain('zeus:wc:index')
    })

    it('generates only index module when manifest has no components (with index enabled)', () => {
      const plugin = wc({ register: 'manual' })
      const ctx = createMockCtx({ version: 1, components: [] })

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result).toHaveLength(1)
      expect(result![0].id).toBe('zeus:wc:index')
      expect(result![0].fileName).toBe('wc/index.js')
    })

    it('generates one virtual module per component plus index', () => {
      const plugin = wc({ register: 'manual' })
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
      expect(result![0].fileName).toBe('wc/z-button.js')
      expect(result![0].code).toContain('import { ZButton }')
      expect(result![0].code).toContain('export { ZButton }')

      expect(result![1].id).toBe('zeus:wc:index')
      expect(result![1].fileName).toBe('wc/index.js')
    })

    it('respects stripPrefix in fileName', () => {
      const plugin = wc({ register: 'manual', stripPrefix: 'z-' })
      const ctx = createMockCtx(
        {
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
        },
        { stripPrefix: 'z-' },
      )

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result![0].fileName).toBe('wc/button.js')
    })

    it('respects custom fileName function', () => {
      const plugin = wc({ register: 'manual', fileName: tag => `my-${tag}` })
      const ctx = createMockCtx(
        {
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
        },
        { fileName: tag => `my-${tag}` },
      )

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result![0].fileName).toBe('wc/my-z-button.js')
    })

    it('respects custom outDir', () => {
      const plugin = wc({ register: 'manual', outDir: 'web-components' })
      const ctx = createMockCtx(
        {
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
        },
        { outDir: 'web-components' },
      )

      const result = plugin.virtualModules!(ctx as any) as any

      expect(result![0].fileName).toBe('web-components/z-button.js')
    })

    it('skips index module when index is false', () => {
      const plugin = wc({ register: 'manual', index: false })
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
    it('generates only lazy declaration assets by default', () => {
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
      const fileNames = new Set(result.map(f => f.fileName))

      expect(fileNames).toContain('wc/loader.d.ts')
      expect(fileNames).toContain('wc/types/jsx.d.ts')
      expect(fileNames).toContain('wc/types/react.d.ts')
      expect(fileNames).not.toContain('wc/components.manifest.ts')
      expect(fileNames).not.toContain('wc/loader.ts')
      expect(fileNames).not.toContain('wc/auto.js')
      expect(fileNames).not.toContain('zeus.components.json')
      expect(fileNames).not.toContain('custom-elements.json')
    })

    it('does not emit broken lazy loader files when manifest is disabled', () => {
      const plugin = wc({ manifest: false })
      const ctx = createMockCtx({ version: 1, components: [] })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]
      const fileNames = new Set(result.map(f => f.fileName))

      expect(fileNames).not.toContain('wc/loader.ts')
      expect(fileNames).not.toContain('wc/auto.js')
      expect(fileNames).not.toContain('wc/loader.d.ts')
    })

    it('generates default assets even when manifest has no components', () => {
      const plugin = wc({ register: 'manual' })
      const ctx = createMockCtx({ version: 1, components: [] })

      const result = plugin.generateBundle!(
        ctx as any,
        {} as OutputBundle,
      ) as ZeusOutputAsset[]

      expect(result).toHaveLength(4)
      const fileNames = new Set(result.map(f => f.fileName))
      expect(fileNames).toContain('custom-elements.json')
      expect(fileNames).toContain('zeus.components.json')
      expect(fileNames).toContain('wc/index.d.ts')
      expect(fileNames).toContain('wc/jsx.d.ts')
    })

    it('generates all default assets with components', () => {
      const plugin = wc({ register: 'manual' })
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

      expect(result).toHaveLength(5)
      const fileNames = new Set(result.map(f => f.fileName))
      expect(fileNames).toContain('custom-elements.json')
      expect(fileNames).toContain('zeus.components.json')
      expect(fileNames).toContain('wc/index.d.ts')
      expect(fileNames).toContain('wc/jsx.d.ts')
      expect(fileNames).toContain('wc/z-button.d.ts')
    })

    it('generates zeus.components.json', () => {
      const plugin = wc({ register: 'manual' })
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
      const manifest = result.find(f => f.fileName === 'zeus.components.json')

      expect(manifest).toBeTruthy()
      expect(JSON.parse(manifest!.source as string)).toMatchObject({
        version: 1,
        components: [{ tag: 'z-button' }],
      })
    })

    it('generates custom-elements.json', () => {
      const plugin = wc({ register: 'manual' })
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
        f => f.fileName === 'custom-elements.json',
      )

      expect(customElements).toBeTruthy()
      expect(JSON.parse(customElements!.source as string)).toMatchObject({
        schemaVersion: '1.0.0',
        modules: [
          {
            kind: 'javascript-module',
            path: 'wc/z-button.js',
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
      const plugin = wc({ register: 'manual' })
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
      const dts = result.find(f => f.fileName === 'wc/index.d.ts')

      expect(dts).toBeTruthy()
      const dtsSource = (dts!.source as string).toLowerCase()
      expect(dtsSource).toContain('declare global')
      expect(dtsSource).toContain('zbuttonelement')
      expect(dtsSource).toContain('"z-button"')
    })

    it('generates jsx.d.ts with JSX namespace', () => {
      const plugin = wc({ register: 'manual' })
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
      const jsxDts = result.find(f => f.fileName === 'wc/jsx.d.ts')

      expect(jsxDts).toBeTruthy()
      expect((jsxDts!.source as string).toLowerCase()).toContain('jsx')
    })

    it('respects custom outDir', () => {
      const plugin = wc({ register: 'manual', outDir: 'web-components' })
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
        register: 'manual',
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
            plugins: [
              wc({
                register: 'manual',
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

      // virtual component entries are emitted as chunks so Rollup can resolve
      // and transform the source modules they re-export.
      expect(files).toContain('wc/z-button.js')
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
