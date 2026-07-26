import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  analyzeComponents,
  analyzeComponentsWithDependencies,
} from '../src/analyzeComponents'

describe('analyzeComponents', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('resolves imported props types and local intersections', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/types.ts'),
      `
        export interface BaseGridProps {
          ariaLabel?: string
          count?: number
        }

        export type GridProps = BaseGridProps & {
          label?: string
        }
      `,
    )

    await fs.writeFile(
      path.join(root, 'src/components/grid.tsx'),
      `
        import type { GridProps } from '../types'
        import styles from './grid.css'
        import { defineElement } from '@zeus-js/zeus'

        void styles

        export const ZGrid = defineElement<GridProps>(
          'z-grid',
          {},
          () => null,
        )
      `,
    )

    await fs.writeFile(
      path.join(root, 'src/components/grid.css'),
      '.grid { display: grid; }',
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])
    expect(result.manifest.components[0].props).toMatchObject({
      ariaLabel: {
        type: 'string',
        required: false,
      },
      count: {
        type: 'number',
        required: false,
      },
      label: {
        type: 'string',
        required: false,
      },
    })

    const internalResult = await analyzeComponentsWithDependencies({
      root,
      include: ['src/components/**/*.tsx'],
    })

    expect(internalResult.dependencies).toContain(
      path.join(root, 'src/types.ts'),
    )
  })

  it('resolves NodeNext type paths through named, star and default barrels', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))
    const typesRoot = path.join(root, 'src/types')

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })
    await fs.mkdir(typesRoot, {
      recursive: true,
    })

    await fs.writeFile(
      path.join(typesRoot, 'default.ts'),
      `
        export default interface DefaultProps {
          defaultOnly?: boolean
        }
      `,
    )
    await fs.writeFile(
      path.join(typesRoot, 'named.mts'),
      `
        export interface NamedProps {
          namedOnly?: string
        }
      `,
    )
    await fs.writeFile(
      path.join(typesRoot, 'star.cts'),
      `
        export interface StarProps {
          starOnly?: number
        }
      `,
    )
    await fs.writeFile(
      path.join(typesRoot, 'public.ts'),
      `
        export type { default } from './default.js'
        export type { NamedProps as BarrelProps } from './named.mjs'
        export * from './star.cjs'
      `,
    )

    const runtimeFiles = [
      path.join(typesRoot, 'default.js'),
      path.join(typesRoot, 'named.mjs'),
      path.join(typesRoot, 'star.cjs'),
      path.join(typesRoot, 'public.js'),
    ]

    for (const file of runtimeFiles) {
      await fs.writeFile(file, 'export ???')
    }

    await fs.writeFile(
      path.join(root, 'src/components/grid.tsx'),
      `
        import { defineElement } from '@zeus-js/zeus'
        import type DefaultProps from '../types/public.js'
        import type {
          BarrelProps,
          StarProps,
        } from '../types/public.js'

        type GridProps = DefaultProps & BarrelProps & StarProps

        export const ZGrid = defineElement<GridProps>(
          'z-grid',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponentsWithDependencies({
      root,
      include: ['src/components/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])
    expect(result.manifest.components[0].props).toMatchObject({
      defaultOnly: {
        type: 'boolean',
        required: false,
      },
      namedOnly: {
        type: 'string',
        required: false,
      },
      starOnly: {
        type: 'number',
        required: false,
      },
    })
    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        path.join(typesRoot, 'default.ts'),
        path.join(typesRoot, 'named.mts'),
        path.join(typesRoot, 'star.cts'),
        path.join(typesRoot, 'public.ts'),
      ]),
    )

    for (const file of runtimeFiles) {
      expect(result.dependencies).not.toContain(file)
    }
  })

  it('returns a diagnostic when an entry file cannot be read', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })
    await fs.writeFile(path.join(root, 'src/button.tsx'), 'export {}')
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(
      new Error('root read failed'),
    )

    const result = await analyzeComponents({
      root,
      include: ['src/**/*.tsx'],
    })

    expect(result.manifest.components).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        level: 'error',
        file: 'src/button.tsx',
        message: 'root read failed',
      },
    ])
  })

  it('returns one diagnostic when an entry file cannot be parsed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(root, 'src/button.tsx'),
      'export const ZButton = <',
    )

    const result = await analyzeComponents({
      root,
      include: ['src/**/*.tsx'],
    })

    expect(result.manifest.components).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        level: 'error',
        file: 'src/button.tsx',
        message: expect.stringContaining('Unexpected token'),
      },
    ])
  })

  it('returns a diagnostic and dependency when an imported file cannot be read', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))
    const componentCode = `
      import { defineElement } from '@zeus-js/zeus'
      import type { ButtonProps } from './types.js'
      export const ZButton = defineElement<ButtonProps>(
        'z-button',
        {},
        () => null,
      )
    `
    const typesFile = path.join(root, 'src/types.ts')

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })
    await fs.writeFile(path.join(root, 'src/button.tsx'), componentCode)
    await fs.writeFile(typesFile, 'export interface ButtonProps {}')
    vi.spyOn(fs, 'readFile')
      .mockResolvedValueOnce(componentCode)
      .mockRejectedValueOnce(new Error('imported read failed'))

    const result = await analyzeComponentsWithDependencies({
      root,
      include: ['src/**/*.tsx'],
    })

    expect(result.manifest.components).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        level: 'error',
        file: 'src/types.ts',
        message: 'imported read failed',
      },
    ])
    expect(result.dependencies).toContain(typesFile)
  })

  it('returns a diagnostic and dependency when an imported file cannot be parsed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-analyzer-'))
    const typesFile = path.join(root, 'src/types.ts')

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(root, 'src/button.tsx'),
      `
        import { defineElement } from '@zeus-js/zeus'
        import type { ButtonProps } from './types.js'
        export const ZButton = defineElement<ButtonProps>(
          'z-button',
          {},
          () => null,
        )
      `,
    )
    await fs.writeFile(typesFile, 'export interface ButtonProps { value: }')

    const result = await analyzeComponentsWithDependencies({
      root,
      include: ['src/**/*.tsx'],
    })

    expect(result.manifest.components).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        level: 'error',
        file: 'src/types.ts',
        message: expect.stringContaining('Unexpected token'),
      },
    ])
    expect(result.dependencies).toContain(typesFile)
  })
})
