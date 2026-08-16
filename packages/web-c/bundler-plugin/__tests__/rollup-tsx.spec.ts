import fs from 'node:fs'
import path from 'node:path'

import { rollup } from 'rollup'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createScopedResolveOptions,
  isAbsoluteImportPath,
  normalizeScopedResolution,
} from '../src/core'
import zeus from '../src/rollup'

const root = path.resolve(__dirname, 'fixtures/rollup-tsx')

describe('rollup adapter', () => {
  afterEach(() => {
    fs.rmSync(path.join(root, 'dist'), {
      recursive: true,
      force: true,
    })
  })

  it('builds tsx components with an external runtime', async () => {
    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['@zeus-js/runtime-dom'],
      plugins: [
        zeus({
          root,
        }),
      ],
    })

    await bundle.write({
      dir: path.join(root, 'dist'),
      format: 'es',
    })

    const files = fs.readdirSync(path.join(root, 'dist'))

    expect(files.length).toBeGreaterThan(0)
    expect(bundle.watchFiles).toContain(path.join(root, 'src/types.ts'))
  })

  it('transpiles TypeScript types away', async () => {
    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['@zeus-js/runtime-dom'],
      plugins: [
        zeus({
          root,
        }),
      ],
    })

    const { output } = await bundle.generate({
      format: 'es',
    })

    const code = output[0].code

    expect(code).toContain('@zeus-js/runtime-dom')
    expect(code).toContain('bindAttr')
    expect(code).toContain('bindText')
    expect(code).toContain('renderLabel')
    expect(code).toContain('template("<span><!></span>")')
    expect(code).toContain('mtsLabel')
    expect(code).toContain('ctsLabel')
    expect(code).not.toContain('ButtonProps')
    expect(code).not.toContain(': ButtonProps')
    expect(code).not.toContain(': string')
  })

  it('resolves absolute extensionless TypeScript imports', async () => {
    const plugin = zeus({
      root,
    })
    const resolveId = plugin.resolveId as (
      id: string,
      importer?: string,
    ) => Promise<string | null>

    const resolved = await resolveId(
      path.join(root, 'src/Button'),
      path.join(root, 'src/index.ts'),
    )

    expect(resolved).toBe(path.join(root, 'src/Button.tsx'))
  })

  it('does not resolve queried extensionless TypeScript imports', async () => {
    const plugin = zeus({
      root,
    })
    const resolveId = plugin.resolveId as (
      id: string,
      importer?: string,
    ) => Promise<string | null>

    const resolved = await resolveId(
      './Button?component',
      path.join(root, 'src/index.ts'),
    )

    expect(resolved).toBeNull()
  })

  it('does not resolve imports that already have an extension', async () => {
    const plugin = zeus({
      root,
    })
    const resolveId = plugin.resolveId as (
      id: string,
      importer?: string,
    ) => Promise<string | null>

    const resolved = await resolveId(
      './Button.tsx',
      path.join(root, 'src/index.ts'),
    )

    expect(resolved).toBeNull()
  })

  it('recognizes Windows absolute import paths', () => {
    expect(isAbsoluteImportPath('C:/repo/src/Button')).toBe(true)
    expect(isAbsoluteImportPath('C:\\repo\\src\\Button')).toBe(true)
    expect(isAbsoluteImportPath('\\\\server\\repo\\src\\Button')).toBe(true)
  })

  it.each([
    '/repo/node_modules/runtime/index.js',
    String.raw`C:\repo\node_modules\runtime\index.js`,
    'file:///repo/node_modules/runtime/index.js',
  ])('keeps an external scoped dependency portable for %s', resolvedId => {
    const resolved = {
      id: resolvedId,
      external: 'absolute' as const,
      attributes: {},
      meta: {},
      moduleSideEffects: true,
      resolvedBy: 'test',
      syntheticNamedExports: false,
    }

    expect(
      normalizeScopedResolution('@zeus-js/web-c-runtime', resolved),
    ).toMatchObject({
      id: '@zeus-js/web-c-runtime',
      external: true,
    })
  })

  it('keeps an internal scoped dependency resolved for bundling', () => {
    const resolved = {
      id: '/repo/node_modules/runtime/index.js',
      external: false,
      attributes: {},
      meta: {},
      moduleSideEffects: true,
      resolvedBy: 'test',
      syntheticNamedExports: false,
    }

    expect(normalizeScopedResolution('@zeus-js/web-c-runtime', resolved)).toBe(
      resolved,
    )
  })

  it('forwards recursive resolution context and only overrides skipSelf', () => {
    const attributes = { type: 'json' }
    const importerAttributes = { mode: 'strict' }
    const custom = { test: { condition: 'development' } }

    expect(
      createScopedResolveOptions({
        attributes,
        custom,
        importerAttributes,
        isEntry: false,
        kind: 'require-call',
      }),
    ).toEqual({
      attributes,
      custom,
      importerAttributes,
      isEntry: false,
      kind: 'require-call',
      skipSelf: true,
    })
  })

  it('compiles custom component include paths by default', async () => {
    const bundle = await rollup({
      input: path.join(root, 'lib/LibButton.tsx'),
      external: ['@zeus-js/runtime-dom'],
      plugins: [
        zeus({
          root,
          components: {
            include: ['lib/**/*.{ts,tsx}'],
          },
        }),
      ],
    })

    const { output } = await bundle.generate({
      format: 'es',
    })

    const code = output[0].code

    expect(code).toContain('@zeus-js/runtime-dom')
    expect(code).toContain('template("<button>Submit</button>")')
  })
})
