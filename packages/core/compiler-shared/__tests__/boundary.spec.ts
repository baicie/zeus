import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { dynamicTextIR, expressionIR, ref } from '../src'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('compiler-shared boundary', () => {
  it('round-trips IR through JSON without compiler frontend objects', () => {
    const node = dynamicTextIR(
      expressionIR('props.title', {
        start: { line: 1, column: 7, offset: 7 },
        end: { line: 1, column: 18, offset: 18 },
      }),
      ref('text$'),
    )

    expect(JSON.parse(JSON.stringify(node))).toEqual(node)
  })

  it('declares no Babel package dependencies', () => {
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    ) as Record<string, Record<string, string> | undefined>
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ]

    expect(dependencyNames.filter(name => name.startsWith('@babel/'))).toEqual(
      [],
    )
  })

  it('keeps Babel imports out of compiler-shared source', () => {
    const sourceFiles = collectFiles(join(packageRoot, 'src'))
    const babelImports = sourceFiles.flatMap(file => {
      const source = readFileSync(file, 'utf8')
      return source.includes('@babel/') ? [file] : []
    })

    expect(babelImports).toEqual([])
  })
})

function collectFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? collectFiles(path) : [path]
  })
}
