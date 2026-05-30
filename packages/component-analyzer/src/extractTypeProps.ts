import * as t from '@babel/types'

import { getLeadingDescription, getObjectKey } from './utils'

import type { ComponentProp } from './types'

export function collectLocalPropTypes(
  ast: t.File,
): Map<string, Record<string, Partial<ComponentProp>>> {
  const map = new Map<string, Record<string, Partial<ComponentProp>>>()

  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node)) {
      const declaration = node.declaration

      if (t.isTSInterfaceDeclaration(declaration)) {
        map.set(declaration.id.name, extractInterfaceProps(declaration))
      }

      if (t.isTSTypeAliasDeclaration(declaration)) {
        const props = extractTypeAliasProps(declaration)

        if (props) {
          map.set(declaration.id.name, props)
        }
      }

      continue
    }

    if (t.isTSInterfaceDeclaration(node)) {
      map.set(node.id.name, extractInterfaceProps(node))
    }

    if (t.isTSTypeAliasDeclaration(node)) {
      const props = extractTypeAliasProps(node)

      if (props) {
        map.set(node.id.name, props)
      }
    }
  }

  return map
}

function extractInterfaceProps(
  node: t.TSInterfaceDeclaration,
): Record<string, Partial<ComponentProp>> {
  const result: Record<string, Partial<ComponentProp>> = {}

  for (const member of node.body.body) {
    if (!t.isTSPropertySignature(member)) continue

    const key = getObjectKey(member.key as t.Expression)
    if (!key) continue

    result[key] = extractTsProperty(member)
  }

  return result
}

function extractTypeAliasProps(
  node: t.TSTypeAliasDeclaration,
): Record<string, Partial<ComponentProp>> | undefined {
  if (!t.isTSTypeLiteral(node.typeAnnotation)) return undefined

  const result: Record<string, Partial<ComponentProp>> = {}

  for (const member of node.typeAnnotation.members) {
    if (!t.isTSPropertySignature(member)) continue

    const key = getObjectKey(member.key as t.Expression)
    if (!key) continue

    result[key] = extractTsProperty(member)
  }

  return result
}

function extractTsProperty(
  node: t.TSPropertySignature,
): Partial<ComponentProp> {
  const prop: Partial<ComponentProp> = {
    required: !node.optional,
  }

  const annotation = node.typeAnnotation?.typeAnnotation

  if (annotation) {
    const inferred = inferType(annotation)

    Object.assign(prop, inferred)
  }

  const description = getLeadingDescription(node)

  if (description) {
    prop.description = description
  }

  return prop
}

function inferType(node: t.TSType): Partial<ComponentProp> {
  if (t.isTSStringKeyword(node)) {
    return { type: 'string' }
  }

  if (t.isTSNumberKeyword(node)) {
    return { type: 'number' }
  }

  if (t.isTSBooleanKeyword(node)) {
    return { type: 'boolean' }
  }

  if (t.isTSArrayType(node)) {
    return { type: 'array' }
  }

  if (t.isTSTypeLiteral(node)) {
    return { type: 'object' }
  }

  if (t.isTSUnionType(node)) {
    const values: string[] = []
    let allStringLiteral = true

    for (const type of node.types) {
      if (t.isTSLiteralType(type) && t.isStringLiteral(type.literal)) {
        values.push(type.literal.value)
      } else {
        allStringLiteral = false
      }
    }

    if (allStringLiteral && values.length > 0) {
      return {
        type: 'string',
        values,
      }
    }
  }

  return {
    type: 'unknown',
  }
}
