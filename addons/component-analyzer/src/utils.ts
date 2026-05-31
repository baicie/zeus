import * as t from '@babel/types'

export function getObjectKey(
  key: t.Expression | t.PrivateName,
): string | undefined {
  if (t.isIdentifier(key)) return key.name
  if (t.isStringLiteral(key)) return key.value
  if (t.isNumericLiteral(key)) return String(key.value)
  return undefined
}

export function getObjectProperty(
  object: t.ObjectExpression,
  name: string,
): t.Expression | t.PatternLike | undefined {
  for (const prop of object.properties) {
    if (!t.isObjectProperty(prop)) continue

    const key = getObjectKey(prop.key)

    if (key === name) {
      return prop.value
    }
  }

  return undefined
}

export function staticValue(node: t.Node | null | undefined): unknown {
  if (!node) return undefined

  if (t.isStringLiteral(node)) return node.value
  if (t.isNumericLiteral(node)) return node.value
  if (t.isBooleanLiteral(node)) return node.value
  if (t.isNullLiteral(node)) return null
  if (t.isIdentifier(node) && node.name === 'undefined') return undefined

  if (t.isArrayExpression(node)) {
    return node.elements.map(element => {
      if (!element) return null
      if (t.isSpreadElement(element)) return undefined
      return staticValue(element)
    })
  }

  if (t.isObjectExpression(node)) {
    const result: Record<string, unknown> = {}

    for (const prop of node.properties) {
      if (!t.isObjectProperty(prop)) continue

      const key = getObjectKey(prop.key)

      if (!key) continue

      result[key] = staticValue(prop.value)
    }

    return result
  }

  return undefined
}

export function getLeadingDescription(node: t.Node): string | undefined {
  const comments = node.leadingComments

  if (!comments?.length) return undefined

  const text = comments
    .map(comment => comment.value)
    .join('\n')
    .replace(/\*/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')

  return text || undefined
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

export function isIdentifierNamed(
  node: t.Node | null | undefined,
  name: string,
): node is t.Identifier {
  return Boolean(node && t.isIdentifier(node) && node.name === name)
}
