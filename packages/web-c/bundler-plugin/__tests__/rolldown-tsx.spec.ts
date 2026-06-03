import fs from 'node:fs'
import path from 'node:path'

import { build } from 'rolldown'
import { afterEach, describe, expect, it } from 'vitest'

import zeus from '../src/rolldown'

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

    expect(code).not.toContain('interface ButtonProps')
    expect(code).not.toContain(': ButtonProps')
  })
})
