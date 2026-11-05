import { describe, expect, it } from 'vitest'

import { exportProject, parseProjectSnapshot } from '../src'

const snapshot = parseProjectSnapshot({
  schemaVersion: 2,
  entryPath: 'src/main.tsx',
  compilerVersion: 'wasm:test',
  dependencies: [{ name: 'zod', version: '4.1.0' }],
  files: [
    {
      path: 'src/main.tsx',
      content:
        "import { Counter } from './counter'\nexport const App = () => Counter()\n",
    },
    {
      path: 'src/counter.tsx',
      content: 'export const Counter = () => null\n',
    },
  ],
})

describe('playground project export', () => {
  it('exports WebC projects with manifest, CEM and declarations', async () => {
    const webc = parseProjectSnapshot({
      schemaVersion: 2,
      entryPath: 'src/counter.tsx',
      frameworkTarget: 'webc',
      compilerVersion: 'wasm:test',
      dependencies: [],
      options: {
        delegateEvents: true,
        sourceMap: true,
        sandboxTimeoutMs: 2_000,
      },
      files: [
        {
          path: 'src/counter.tsx',
          content: `import { defineElement, Host } from '@zeus-js/zeus'
export const ZeCounter = defineElement('z-counter', {
  shadow: false,
  props: { count: Number },
}, () => <Host><button>{'x'}</button></Host>)
`,
        },
      ],
    })
    const exported = await exportProject(webc, { compress: false })
    const paths = exported.files.map(file => file.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'zeus.components.json',
        'custom-elements.json',
        'z-counter.d.ts',
        'src/__zeus_playground_entry.ts',
      ]),
    )
  })

  it('creates a deterministic installable project tar archive', async () => {
    const exported = await exportProject(snapshot, { compress: false })
    const paths = exported.files.map(file => file.path)

    expect(paths).toEqual(
      expect.arrayContaining([
        'index.html',
        'package.json',
        'README.md',
        'src/__zeus_playground_entry.ts',
        'src/counter.tsx',
        'src/main.tsx',
        'tsconfig.json',
        'vite.config.ts',
      ]),
    )
    expect(exported.fileName).toBe('zeus-playground-export.tar')
    expect(exported.mediaType).toBe('application/x-tar')
    expect(new TextDecoder().decode(exported.data.slice(257, 263))).toBe(
      'ustar\0',
    )
    expect(exported.data.byteLength % 512).toBe(0)

    const second = await exportProject(snapshot, { compress: false })
    expect(second.data).toEqual(exported.data)
  })

  it('creates a gzip archive and validates package metadata', async () => {
    const exported = await exportProject(snapshot, {
      packageName: '@example/playground',
    })
    const packageFile = exported.files.find(
      file => file.path === 'package.json',
    )
    expect(packageFile).toBeDefined()
    expect(JSON.parse(packageFile!.content)).toMatchObject({
      name: '@example/playground',
      dependencies: {
        '@zeus-js/zeus': '0.1.1-beta.20',
        zod: '4.1.0',
      },
      pnpm: {
        onlyBuiltDependencies: [],
      },
      scripts: {
        check: 'tsc --noEmit',
        build: 'vite build',
      },
    })
    expect(exported.fileName).toBe('@example-playground.tar.gz')
    expect(exported.mediaType).toBe('application/gzip')
    expect([...exported.data.slice(0, 2)]).toEqual([0x1f, 0x8b])
  })
})
