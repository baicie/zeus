import * as t from '@babel/types'

import { getLeadingDescription, getObjectKey } from './utils'

import type { ComponentProp } from './types'

export function collectLocalPropTypes(
  ast: t.File,
  importedPropTypes: Map<
    string,
    Record<string, Partial<ComponentProp>>
  > = new Map(),
): Map<string, Record<string, Partial<ComponentProp>>> {
  const declarations = collectTypeDeclarations(ast)
  const resolved = new Map(importedPropTypes)
  const resolving = new Set<string>()

  const resolve = (
    name: string,
  ): Record<string, Partial<ComponentProp>> | undefined => {
    const cached = resolved.get(name)

    if (cached) return cached
    if (resolving.has(name)) return undefined

    const declaration = declarations.get(name)

    if (!declaration) return undefined

    resolving.add(name)
    const props = t.isTSInterfaceDeclaration(declaration)
      ? extractInterfaceProps(declaration, resolve)
      : extractTypeAliasProps(declaration, resolve)
    resolving.delete(name)

    if (props) {
      resolved.set(name, props)
    }

    return props
  }

  for (const name of declarations.keys()) {
    resolve(name)
  }

  return resolved
}

function collectTypeDeclarations(
  ast: t.File,
): Map<string, t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration> {
  const declarations = new Map<
    string,
    t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration
  >()

  for (const node of ast.program.body) {
    const declaration =
      t.isExportNamedDeclaration(node) || t.isExportDefaultDeclaration(node)
        ? node.declaration
        : node

    if (
      t.isTSInterfaceDeclaration(declaration) ||
      t.isTSTypeAliasDeclaration(declaration)
    ) {
      declarations.set(declaration.id.name, declaration)
    }
  }

  return declarations
}

function extractInterfaceProps(
  node: t.TSInterfaceDeclaration,
  resolve: (name: string) => Record<string, Partial<ComponentProp>> | undefined,
): Record<string, Partial<ComponentProp>> | undefined {
  const result: Record<string, Partial<ComponentProp>> = {}

  for (const extension of node.extends ?? []) {
    if (!t.isIdentifier(extension.expression)) return undefined

    const inherited = resolve(extension.expression.name)

    if (!inherited) return undefined

    Object.assign(result, inherited)
  }

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
  resolve: (name: string) => Record<string, Partial<ComponentProp>> | undefined,
): Record<string, Partial<ComponentProp>> | undefined {
  return extractTypeNodeProps(node.typeAnnotation, resolve)
}

function extractTypeNodeProps(
  node: t.TSType,
  resolve: (name: string) => Record<string, Partial<ComponentProp>> | undefined,
): Record<string, Partial<ComponentProp>> | undefined {
  if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
    return resolve(node.typeName.name)
  }

  if (t.isTSIntersectionType(node)) {
    const result: Record<string, Partial<ComponentProp>> = {}

    for (const typeNode of node.types) {
      const props = extractTypeNodeProps(typeNode, resolve)

      if (!props) return undefined

      Object.assign(result, props)
    }

    return result
  }

  if (!t.isTSTypeLiteral(node)) return undefined

  const result: Record<string, Partial<ComponentProp>> = {}

  for (const member of node.members) {
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
