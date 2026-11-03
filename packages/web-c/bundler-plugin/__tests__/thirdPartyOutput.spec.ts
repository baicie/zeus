// A third-party Output Target is an ordinary package outside this repository.
// It talks to the build only through the public plugin contract.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { rollup } from 'rollup'
import { afterEach, describe, expect, it } from 'vitest'

import zeus, { ZEUS_PLUGIN_API_VERSION } from '../src'

import type { ZeusComponentPlugin } from '../src'
import type { OutputAsset } from 'rollup'

const directories: string[] = []

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), prefix)),
  )
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(directory => fs.rm(directory, { force: true, recursive: true })),
  )
})

async function createComponentProject(): Promise<string> {
  const root = await temporaryDirectory('zeus-third-party-project-')
  await fs.mkdir(path.join(root, 'src/components'), { recursive: true })
  await fs.writeFile(path.join(root, 'src/index.ts'), 'export {}\n')
  await fs.writeFile(
    path.join(root, 'src/components/button.tsx'),
    `
      import { defineElement, event } from '@zeus-js/zeus'

      export const ZButton = defineElement(
        'z-button',
        {
          props: { label: String },
          emits: { press: event<{ count: number }>() },
        },
        () => null,
      )
    `,
  )
  return root
}

async function createExternalOutputPackage(): Promise<ZeusComponentPlugin> {
  const directory = await temporaryDirectory('acme-output-json-')
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'acme-output-json',
      type: 'module',
      exports: './index.js',
    }),
  )
  await fs.writeFile(
    path.join(directory, 'index.js'),
    `
      export default function acmeJsonOutput() {
        return {
          apiVersion: 1,
          name: 'acme-output-json',
          setup(ctx) {
            ctx.outputs.register('acme:json', { outDir: 'acme', fileName: tag => tag + '.json' })
          },
          generateBundle(ctx) {
            return ctx.manifest.components.map(component => ({
              type: 'asset',
              fileName: ctx.outputs.join('acme:json', ctx.outputs.getFileName('acme:json', component.tag)),
              source: JSON.stringify({
                tag: component.tag,
                props: Object.keys(component.props),
                events: Object.values(component.events).map(event => event.name),
              }),
            }))
          },
        }
      }
    `,
  )
  const module = (await import(
    pathToFileURL(path.join(directory, 'index.js')).href
  )) as { default: () => ZeusComponentPlugin }
  return module.default()
}

async function createCommittedOutputPackage(): Promise<ZeusComponentPlugin> {
  const module = (await import(
    pathToFileURL(
      path.resolve(
        import.meta.dirname,
        '../../../../examples/fixtures/third-party-output-plugin/index.js',
      ),
    ).href
  )) as { default: () => ZeusComponentPlugin }
  return module.default()
}

async function build(root: string, plugins: ZeusComponentPlugin[]) {
  const bundle = await rollup({
    input: path.join(root, 'src/index.ts'),
    plugins: [
      zeus({
        root,
        components: { include: ['src/components/**/*.tsx'] },
        plugins,
      }),
    ],
    onwarn() {},
  })
  return bundle.generate({ dir: path.join(root, 'dist'), format: 'esm' })
}

function asset(name: string, fileName: string): ZeusComponentPlugin {
  return {
    apiVersion: 1,
    name,
    generateBundle: () => [{ type: 'asset', fileName, source: name }],
  }
}

describe('third-party output targets', () => {
  it('loads the committed external author sample through the public contract', async () => {
    const root = await createComponentProject()
    const result = await build(root, [await createCommittedOutputPackage()])
    const emitted = result.output.find(
      item => item.fileName === 'acme/z-button.json',
    ) as OutputAsset | undefined

    expect(emitted?.type).toBe('asset')
    expect(JSON.parse(String(emitted!.source))).toEqual({
      tag: 'z-button',
      props: ['label'],
      events: ['press'],
    })
  })

  it('builds with an output package written outside the repository', async () => {
    const root = await createComponentProject()
    const result = await build(root, [await createExternalOutputPackage()])

    const emitted = result.output.find(
      item => item.fileName === 'acme/z-button.json',
    ) as OutputAsset | undefined
    expect(emitted?.type).toBe('asset')
    expect(JSON.parse(String(emitted!.source))).toEqual({
      tag: 'z-button',
      props: ['label'],
      events: ['press'],
    })
    expect(ZEUS_PLUGIN_API_VERSION).toBe(1)
  })

  it('rejects a plugin written for another plugin API', async () => {
    const root = await createComponentProject()
    const plugin = { ...asset('future-output', 'f.json'), apiVersion: 2 }

    await expect(
      build(root, [plugin as unknown as ZeusComponentPlugin]),
    ).rejects.toThrow(
      '[ZEUS_PLUGIN_API_VERSION] output plugin "future-output" targets plugin API 2',
    )
  })

  it('rejects two plugins that emit the same file', async () => {
    const root = await createComponentProject()

    await expect(
      build(root, [
        asset('first-output', 'same.json'),
        asset('second-output', 'same.json'),
      ]),
    ).rejects.toThrow(
      '[ZEUS_OUTPUT_CONFLICT] output plugins "first-output" and "second-output" both emit "same.json".',
    )
  })

  it('rejects an output kind that is not namespaced or has no directory', async () => {
    const root = await createComponentProject()
    const register = (kind: string, outDir?: string): ZeusComponentPlugin => ({
      apiVersion: 1,
      name: `register-${kind}`,
      setup(ctx) {
        ctx.outputs.register(kind as 'acme:json', { outDir })
      },
    })

    await expect(build(root, [register('svelte', 'svelte')])).rejects.toThrow(
      '[ZEUS_OUTPUT_CONFIG] unknown output kind "svelte"',
    )
    await expect(build(root, [register('acme:svelte')])).rejects.toThrow(
      '[ZEUS_OUTPUT_CONFIG] output kind "acme:svelte" must set outDir',
    )
  })
})
