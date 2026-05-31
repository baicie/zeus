import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { analyzeComponents } from '../src/analyzeComponents'

describe('analyzeComponents', () => {
  it('scans files and returns manifest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/button.tsx'),
      `
        import { defineElement } from '@zeus-js/zeus'

        export const ZButton = defineElement(
          'z-button',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])
    expect(result.manifest).toMatchObject({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
        },
      ],
    })
  })

  it('scans multiple files and merges components', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/button.tsx'),
      `
        import { defineElement } from '@zeus-js/zeus'

        export const ZButton = defineElement(
          'z-button',
          {},
          () => null,
        )
      `,
    )

    await fs.writeFile(
      path.join(root, 'src/icon.tsx'),
      `
        import { defineElement } from '@zeus-js/zeus'

        export const ZIcon = defineElement(
          'z-icon',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])
    expect(result.manifest.components).toHaveLength(2)
    expect(result.manifest.components.map(c => c.tag).sort()).toEqual([
      'z-button',
      'z-icon',
    ])
  })

  it('excludes files matching exclude patterns', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })
    await fs.mkdir(path.join(root, 'src/dist'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/button.tsx'),
      `
        import { defineElement } from '@zeus-js/zeus'
        export const ZButton = defineElement('z-button', {}, () => null)
      `,
    )

    await fs.writeFile(
      path.join(root, 'src/dist/button.tsx'),
      `
        import { defineElement } from '@zeus-js/zeus'
        export const ZDistButton = defineElement('z-dist-button', {}, () => null)
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/**/*.tsx'],
      exclude: ['**/dist/**'],
    })

    expect(result.manifest.components).toHaveLength(1)
    expect(result.manifest.components[0].tag).toBe('z-button')
  })
})
