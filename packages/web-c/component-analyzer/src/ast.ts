import { parse } from '@babel/parser'
import * as t from '@babel/types'

export function parseSource(code: string, file: string): t.File {
  return parse(code, {
    sourceType: 'module',
    sourceFilename: file,
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
  })
}

export function walk(
  node: t.Node | null | undefined,
  visitor: (node: t.Node, parent: t.Node | null) => void,
  parent: t.Node | null = null,
): void {
  if (!node) return

  visitor(node, parent)

  const keys = t.VISITOR_KEYS[node.type] ?? []

  for (const key of keys) {
    const value = (node as unknown as Record<string, unknown>)[key]

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          walk(child as t.Node, visitor, node)
        }
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      walk(value as t.Node, visitor, node)
    }
  }
}
