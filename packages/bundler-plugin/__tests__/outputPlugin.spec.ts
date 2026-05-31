import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rollup } from 'rollup'
import { describe, expect, it, vi } from 'vitest'

import zeus from '../src'

import type { ZeusOutputPlugin } from '../src'
import type { OutputChunk } from 'rollup'

describe('output plugin lifecycle', () => {
  it('calls output plugin hooks via real Rollup build', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-output-hooks-'))

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/index.tsx'),
      `
        export function App() {
          return <div>App</div>
        }
      `,
    )

    const buildStart = vi.fn()
    const virtualModules = vi.fn()
    const generateBundle = vi.fn()

    const outputPlugin: ZeusOutputPlugin = {
      name: 'test-output',

      buildStart() {
        buildStart()
      },

      virtualModules() {
        virtualModules()

        return [
          {
            id: 'zeus:test:virtual',
            fileName: 'virtual.js',
            code: `export const value = 1;`,
          },
        ]
      },

      generateBundle() {
        generateBundle()

        return [
          {
            type: 'asset',
            fileName: 'test.txt',
            source: 'ok',
          },
        ]
      },
    }

    const bundle = await rollup({
      input: path.join(root, 'src/index.tsx'),
      plugins: [
        zeus({
          root,
          outputs: [outputPlugin],
        }),
      ],
      onwarn() {},
    })

    const result = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    expect(buildStart).toHaveBeenCalledTimes(1)
    expect(virtualModules).toHaveBeenCalledTimes(1)
    expect(generateBundle).toHaveBeenCalledTimes(1)

    expect(result.output.some(item => item.fileName === 'test.txt')).toBe(true)

    expect(result.output.some(item => item.fileName === 'virtual.js')).toBe(
      true,
    )

    const virtualChunk = result.output.find(
      item => item.fileName === 'virtual.js',
    )
    expect(virtualChunk?.type).toBe('chunk')
    expect((virtualChunk as OutputChunk)?.code).toContain('value')
  })

  it('ZeusOutputAsset type', () => {
    const asset = {
      type: 'asset' as const,
      fileName: 'test.json',
      source: '{"ok": true}',
    }

    expect(asset.type).toBe('asset')
    expect(asset.fileName).toBe('test.json')
  })

  it('ZeusOutputChunk type', () => {
    const chunk = {
      type: 'chunk' as const,
      id: 'virtual:module',
      fileName: 'module.js',
    }

    expect(chunk.type).toBe('chunk')
    expect(chunk.id).toBe('virtual:module')
  })
})
