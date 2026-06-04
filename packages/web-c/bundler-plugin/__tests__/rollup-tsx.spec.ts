import fs from 'node:fs'
import path from 'node:path'

import { rollup } from 'rollup'
import { afterEach, describe, expect, it } from 'vitest'

import zeus from '../src/rollup'

const root = path.resolve(__dirname, 'fixtures/rollup-tsx')

describe('rollup adapter', () => {
  afterEach(() => {
    fs.rmSync(path.join(root, 'dist'), {
      recursive: true,
      force: true,
    })
  })

  it('builds tsx components with zeus() and runtime alias', async () => {
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
    expect(code).toContain('mtsLabel')
    expect(code).toContain('ctsLabel')
    expect(code).not.toContain('ButtonProps')
    expect(code).not.toContain(': ButtonProps')
    expect(code).not.toContain(': string')
  })
})
