import { parse } from '@babel/parser'

export interface PlaygroundModuleImport {
  readonly specifier: string
  readonly kind: 'dynamic-import' | 'export' | 'import'
  readonly typeOnly: boolean
  readonly start: number
  readonly end: number
}

interface SyntaxNode {
  readonly type: string
  readonly start?: number | null
  readonly end?: number | null
  readonly source?: SyntaxNode | null
  readonly importKind?: string | null
  readonly exportKind?: string | null
  readonly value?: unknown
  readonly [key: string]: unknown
}

/**
 * Reads the static and literal dynamic ESM edges the playground can mirror in
 * its browser sandbox. Non-literal dynamic imports are not resolvable.
 */
export function analyzeModuleImports(source: string): PlaygroundModuleImport[] {
  const file = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  })
  const imports: PlaygroundModuleImport[] = []
  const stack: unknown[] = [file.program]

  while (stack.length > 0) {
    const value = stack.pop()
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push(value[index])
      }
      continue
    }
    if (!isSyntaxNode(value)) continue

    if (value.type === 'ImportDeclaration') {
      const specifier = readStringSource(value)
      if (
        specifier &&
        typeof value.start === 'number' &&
        typeof value.end === 'number'
      ) {
        imports.push({
          specifier,
          kind: 'import',
          typeOnly: value.importKind === 'type',
          start: value.start,
          end: value.end,
        })
      }
    } else if (value.type === 'ImportExpression') {
      const specifier = readStringSource(value)
      if (
        specifier &&
        typeof value.start === 'number' &&
        typeof value.end === 'number'
      ) {
        imports.push({
          specifier,
          kind: 'dynamic-import',
          typeOnly: false,
          start: value.start,
          end: value.end,
        })
      }
    } else if (
      value.type === 'ExportNamedDeclaration' ||
      value.type === 'ExportAllDeclaration'
    ) {
      const specifier = readStringSource(value)
      if (
        specifier &&
        typeof value.start === 'number' &&
        typeof value.end === 'number'
      ) {
        imports.push({
          specifier,
          kind: 'export',
          typeOnly: value.exportKind === 'type',
          start: value.start,
          end: value.end,
        })
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key === 'loc' ||
        key === 'start' ||
        key === 'end' ||
        key === 'extra' ||
        key === 'errors'
      ) {
        continue
      }
      if (Array.isArray(child) || isSyntaxNode(child)) stack.push(child)
    }
  }

  return imports.sort((left, right) => left.start - right.start)
}

function readStringSource(node: SyntaxNode): string | undefined {
  return isSyntaxNode(node.source) && typeof node.source.value === 'string'
    ? node.source.value
    : undefined
}

function isSyntaxNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}
