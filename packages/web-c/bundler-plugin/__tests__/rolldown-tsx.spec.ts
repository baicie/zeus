import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'rolldown'
import { afterEach, describe, expect, it } from 'vitest'

import zeus from '../src/rolldown'

import type { ZeusComponentPlugin } from '../src'
import type { Plugin } from 'rolldown'

const root = path.resolve(__dirname, 'fixtures/rolldown-tsx')

describe('rolldown adapter', () => {
  afterEach(() => {
    fs.rmSync(path.join(root, 'dist'), {
      recursive: true,
      force: true,
    })
  })

  it('builds tsx components with zeus() only', async () => {
    await build({
      input: path.join(root, 'src/index.ts'),
      plugins: [
        zeus({
          root,
        }),
      ],
      output: {
        dir: path.join(root, 'dist'),
        format: 'esm',
      },
    })

    const files = fs.readdirSync(path.join(root, 'dist'))

    expect(files.length).toBeGreaterThan(0)

    const code = fs.readFileSync(path.join(root, 'dist', 'index.js'), 'utf-8')

    expect(code).toContain(
      'template("<button data-zeus-node=\\"2\\"><!></button>")',
    )
    expect(code).toContain('bindAttr')
    expect(code).toContain('bindText')
    expect(code).not.toContain('interface ButtonProps')
    expect(code).not.toContain(': ButtonProps')
  })

  it('keeps scoped external imports portable and preserves require kind', async () => {
    const resolveKinds: string[] = []
    const scopedOutput: ZeusComponentPlugin = {
      name: 'scoped-output',
      virtualModules() {
        return [
          {
            id: 'zeus:test:scoped',
            fileName: 'scoped.js',
            code: [
              `const picomatch = require('picomatch')`,
              `export const matchesJs = picomatch('*.js')('index.js')`,
            ].join('\n'),
            resolveFrom: fileURLToPath(import.meta.url),
          },
        ]
      },
    }
    const contextProbe: Plugin = {
      name: 'resolve-context-probe',
      resolveId(id, _importer, options) {
        if (id === 'picomatch') {
          resolveKinds.push(options.kind)
        }
        return null
      },
    }

    await build({
      input: path.join(root, 'src/index.ts'),
      external: id => id.includes('node_modules'),
      plugins: [
        zeus({
          root,
          plugins: [scopedOutput],
        }),
        contextProbe,
      ],
      output: {
        dir: path.join(root, 'dist'),
        format: 'esm',
      },
    })

    const code = fs.readFileSync(path.join(root, 'dist', 'scoped.js'), 'utf-8')

    expect(resolveKinds).toContain('require-call')
    expect(code).toMatch(/["']picomatch["']/)
    expect(code.replace(/\\/g, '/')).not.toContain('/node_modules/')
  })
})
