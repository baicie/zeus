import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { analyzeComponents } from '@zeus-js/component-analyzer'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { generateLoaderDts } from '../src/generateLoaderDts'
import { generateReactDts } from '../src/generateReactDts'
import { generateComponentWCDts } from '../src/generateWcDts'

describe('generated declaration consumer contract', () => {
  it('emits self-contained React and custom element declarations', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-dts-consumer-'))

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/types.ts'),
      `
        export interface GridRow {
          id: string
        }

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
        import type { GridProps, GridRow } from '../types'
        import { defineElement, event } from '@zeus-js/zeus'

        function setup(_props: GridProps, { expose }: { expose: Function }) {
          expose({
            focus(): void {},
            selectRow(row: Pick<GridRow, 'id'>): void {
              void row
            },
            selectNestedRow(row: Pick<GridRow | null, 'id'>): void {
              void row
            },
            setRows(rows: GridRow[]): void {
              void rows
            },
          })

          return null
        }

        export const ZGrid = defineElement<GridProps>(
          'z-grid',
          {
            props: {
              ariaLabel: String,
            },
            emits: {
              rowChange: event<{ row: GridRow }>(),
            },
          },
          setup,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])
    expect(result.manifest.components[0].props).toHaveProperty('count')
    expect(result.manifest.components[0].props).toHaveProperty('label')

    const reactDts = generateReactDts(result.manifest)
    const loaderDts = generateLoaderDts(result.manifest)
    const wcDts = generateComponentWCDts(result.manifest.components[0])

    expect(reactDts).not.toContain('GridRow')
    expect(loaderDts).not.toContain('GridRow')
    expect(wcDts).not.toContain('GridRow')
    expect(reactDts).not.toContain('Pick<unknown')
    expect(loaderDts).not.toContain('Pick<unknown')
    expect(wcDts).not.toContain('Pick<unknown')
    expect(reactDts).toContain('selectNestedRow(row: unknown): void')
    expect(loaderDts).toContain('selectNestedRow(row: unknown): Promise<void>')
    expect(wcDts).toContain('selectNestedRow(row: unknown): void')
    const rootNames = [
      ...(await writeDeclarationFixture(root, 'react', reactDts)),
      ...(await writeDeclarationFixture(root, 'loader', loaderDts)),
      ...(await writeDeclarationFixture(root, 'wc', wcDts)),
    ]
    const reactStubPath = path.join(root, 'react.d.ts')

    await fs.writeFile(
      reactStubPath,
      `
        declare module 'react' {
          export type ReactNode = unknown
          export interface CSSProperties {
            [key: string]: string | number | undefined
          }
          export interface RefAttributes<T> {
            ref?: T | null
          }
          export interface ForwardRefExoticComponent<P> {
            (props: P): ReactNode
          }
        }
      `,
    )
    rootNames.push(reactStubPath)

    expectDeclarationsToCompile(rootNames)
  }, 15000)
})

async function writeDeclarationFixture(
  root: string,
  outputName: string,
  declaration: string,
): Promise<string[]> {
  const outputDir = path.join(root, outputName)
  const declarationPath = path.join(outputDir, 'index.d.ts')
  const consumerPath = path.join(outputDir, 'consumer.ts')
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(declarationPath, declaration)
  await fs.writeFile(
    consumerPath,
    `
      import type { ZGridElement } from './index'

      declare const grid: ZGridElement
      const host: HTMLElement = grid
      grid.ariaLabel = null
      grid.selectNestedRow(null)
      grid.selectRow({ id: 'row-1' })
      grid.setRows([])
      void host
      ${
        outputName === 'wc'
          ? `grid.addEventListener('row-change', event => {
        const row: unknown = event.detail.row
        void row
      })
      grid.addEventListener('click', event => {
        const mouseEvent: MouseEvent = event
        void mouseEvent
      })`
          : ''
      }
      ${
        outputName === 'loader'
          ? 'const focused: Promise<void> = grid.focus()\n      const ready: Promise<ZGridElement> = grid.componentOnReady()\n      void focused\n      void ready'
          : ''
      }
    `,
  )

  return [declarationPath, consumerPath]
}

function expectDeclarationsToCompile(rootNames: string[]): void {
  const program = ts.createProgram(rootNames, {
    lib: ['lib.es2016.d.ts', 'lib.dom.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2016,
    types: [],
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)

  expect(formatDiagnostics(diagnostics)).toEqual([])
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map(diagnostic => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    )

    if (!diagnostic.file || diagnostic.start === undefined) {
      return message
    }

    const position = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start,
    )
    return `${path.basename(diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`
  })
}
