import * as t from '@babel/types'

import {
  collectSourceBoundTypeNames,
  isPortableTypeReference,
} from './portable-types'
import { getLeadingDescription, getObjectKey } from './utils'

import type { ComponentProp } from './types'

const TypePrecedence = {
  Function: 0,
  Union: 1,
  Intersection: 2,
  Primary: 3,
} as const

type TypePrecedence = (typeof TypePrecedence)[keyof typeof TypePrecedence]

interface FormattedType {
  text: string
  precedence: TypePrecedence
}

const MAX_PORTABLE_TYPE_LENGTH = 32_768

type FormatNamedType = (name: string) => FormattedType | undefined
type HasNamedType = (name: string) => boolean
type ExtractedComponentProp = Partial<ComponentProp> & {
  readonly?: boolean
}

export function collectLocalPropTypes(
  ast: t.File,
  importedPropTypes: Map<
    string,
    Record<string, Partial<ComponentProp>>
  > = new Map(),
  sourceBoundTypeNames: ReadonlySet<string> = collectSourceBoundTypeNames(ast),
): Map<string, Record<string, Partial<ComponentProp>>> {
  const declarations = collectTypeDeclarations(ast)
  const resolved = new Map(importedPropTypes)
  const resolving = new Set<string>()
  const sourceTypeNames = new Set(sourceBoundTypeNames)

  for (const name of importedPropTypes.keys()) {
    sourceTypeNames.add(name)
  }

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
      ? extractInterfaceProps(
          declaration,
          resolve,
          formatNamedType,
          hasNamedType,
        )
      : extractTypeAliasProps(
          declaration,
          resolve,
          formatNamedType,
          hasNamedType,
        )
    resolving.delete(name)

    if (props) {
      resolved.set(name, props)
    }

    return props
  }

  const hasNamedType: HasNamedType = name =>
    sourceTypeNames.has(name) || declarations.has(name) || resolved.has(name)
  const formatting = new Set<string>()
  const formattedTypes = new Map<string, FormattedType | null>()
  const formatNamedType = (name: string): FormattedType | undefined => {
    if (formattedTypes.has(name)) {
      return formattedTypes.get(name) ?? undefined
    }
    if (formatting.has(name)) return undefined

    formatting.add(name)
    try {
      const declaration = declarations.get(name)
      let formatted: FormattedType | undefined

      if (t.isTSTypeAliasDeclaration(declaration)) {
        formatted = formatPortableType(
          declaration.typeAnnotation,
          formatNamedType,
          hasNamedType,
        )
      } else {
        const props = resolve(name)
        const text = props ? formatPropMap(props) : undefined
        formatted = text ? primaryType(text) : undefined
      }

      formattedTypes.set(name, formatted ?? null)
      return formatted
    } finally {
      formatting.delete(name)
    }
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
  const declarationCounts = collectTypeBindingCounts(ast)

  for (const node of ast.program.body) {
    const declaration =
      t.isExportNamedDeclaration(node) || t.isExportDefaultDeclaration(node)
        ? node.declaration
        : node

    if (
      t.isTSInterfaceDeclaration(declaration) ||
      t.isTSTypeAliasDeclaration(declaration)
    ) {
      if (declaration.typeParameters?.params.length) continue
      if (declarationCounts.get(declaration.id.name) !== 1) continue
      declarations.set(declaration.id.name, declaration)
    }
  }

  return declarations
}

function collectTypeBindingCounts(ast: t.File): Map<string, number> {
  const counts = new Map<string, number>()
  const add = (name: string): void => {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  for (const statement of ast.program.body) {
    if (t.isImportDeclaration(statement)) {
      for (const specifier of statement.specifiers) add(specifier.local.name)
      continue
    }

    const declaration =
      t.isExportNamedDeclaration(statement) ||
      t.isExportDefaultDeclaration(statement)
        ? statement.declaration
        : statement

    if (!declaration) continue

    if (
      t.isTSInterfaceDeclaration(declaration) ||
      t.isTSTypeAliasDeclaration(declaration) ||
      t.isClassDeclaration(declaration) ||
      t.isTSEnumDeclaration(declaration) ||
      t.isTSImportEqualsDeclaration(declaration)
    ) {
      if (declaration.id) add(declaration.id.name)
      continue
    }

    if (t.isTSModuleDeclaration(declaration)) {
      if (t.isIdentifier(declaration.id)) add(declaration.id.name)
      if (t.isStringLiteral(declaration.id)) add(declaration.id.value)
    }
  }

  return counts
}

function extractInterfaceProps(
  node: t.TSInterfaceDeclaration,
  resolve: (name: string) => Record<string, Partial<ComponentProp>> | undefined,
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): Record<string, Partial<ComponentProp>> | undefined {
  const result: Record<string, Partial<ComponentProp>> = {}

  for (const extension of node.extends ?? []) {
    if (!t.isIdentifier(extension.expression)) return undefined
    if (extension.typeArguments?.params.length) return undefined

    const inherited = resolve(extension.expression.name)

    if (!inherited) return undefined

    if (!mergeUniqueProps(result, inherited)) return undefined
  }

  for (const member of node.body.body) {
    if (!t.isTSPropertySignature(member) || member.computed) return undefined
    const key = getObjectKey(member.key as t.Expression)
    if (!key) return undefined

    if (hasOwnProp(result, key)) return undefined
    result[key] = extractTsProperty(member, formatNamedType, hasNamedType)
  }

  return result
}

function extractTypeAliasProps(
  node: t.TSTypeAliasDeclaration,
  resolve: (name: string) => Record<string, Partial<ComponentProp>> | undefined,
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): Record<string, Partial<ComponentProp>> | undefined {
  return extractTypeNodeProps(
    node.typeAnnotation,
    resolve,
    formatNamedType,
    hasNamedType,
  )
}

function extractTypeNodeProps(
  node: t.TSType,
  resolve: (name: string) => Record<string, Partial<ComponentProp>> | undefined,
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): Record<string, Partial<ComponentProp>> | undefined {
  if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
    if (node.typeArguments?.params.length) return undefined
    return resolve(node.typeName.name)
  }

  if (t.isTSIntersectionType(node)) {
    const result: Record<string, Partial<ComponentProp>> = {}

    for (const typeNode of node.types) {
      const props = extractTypeNodeProps(
        typeNode,
        resolve,
        formatNamedType,
        hasNamedType,
      )

      if (!props) return undefined

      if (!mergeUniqueProps(result, props)) return undefined
    }

    return result
  }

  if (!t.isTSTypeLiteral(node)) return undefined

  const result: Record<string, Partial<ComponentProp>> = {}

  for (const member of node.members) {
    if (!t.isTSPropertySignature(member) || member.computed) return undefined

    const key = getObjectKey(member.key as t.Expression)
    if (!key) return undefined

    if (hasOwnProp(result, key)) return undefined
    result[key] = extractTsProperty(member, formatNamedType, hasNamedType)
  }

  return result
}

function extractTsProperty(
  node: t.TSPropertySignature,
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): ExtractedComponentProp {
  const prop: ExtractedComponentProp = {
    required: !node.optional,
  }

  if (node.readonly) {
    prop.readonly = true
  }

  const annotation = node.typeAnnotation?.typeAnnotation

  if (annotation) {
    const inferred = inferType(annotation, formatNamedType, hasNamedType)

    Object.assign(prop, inferred)
  }

  const description = getLeadingDescription(node)

  if (description) {
    prop.description = description
  }

  return prop
}

function inferType(
  node: t.TSType,
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): Partial<ComponentProp> {
  const declaration = inferDeclaration(node, formatNamedType, hasNamedType)

  if (t.isTSStringKeyword(node)) {
    return { type: 'string', declaration }
  }

  if (t.isTSNumberKeyword(node)) {
    return { type: 'number', declaration }
  }

  if (t.isTSBooleanKeyword(node)) {
    return { type: 'boolean', declaration }
  }

  if (t.isTSArrayType(node)) {
    return { type: 'array', declaration }
  }

  if (t.isTSTypeLiteral(node)) {
    return { type: 'object', declaration }
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
        declaration,
      }
    }
  }

  return {
    type: 'unknown',
    declaration,
  }
}

function inferDeclaration(
  node: t.TSType,
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): ComponentProp['declaration'] {
  const formatted = formatPortableType(node, formatNamedType, hasNamedType)
  if (!formatted) return undefined

  const reference =
    t.isTSTypeReference(node) &&
    t.isIdentifier(node.typeName) &&
    hasNamedType(node.typeName.name)
      ? node.typeName.name
      : undefined

  return { reference, type: formatted.text }
}

function formatPortableType(
  node: t.TSType,
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): FormattedType | undefined {
  if (t.isTSStringKeyword(node)) return primaryType('string')
  if (t.isTSNumberKeyword(node)) return primaryType('number')
  if (t.isTSBooleanKeyword(node)) return primaryType('boolean')
  if (t.isTSUnknownKeyword(node) || t.isTSAnyKeyword(node)) {
    return primaryType('unknown')
  }
  if (t.isTSVoidKeyword(node)) return primaryType('void')
  if (t.isTSNeverKeyword(node)) return primaryType('never')
  if (t.isTSNullKeyword(node)) return primaryType('null')
  if (t.isTSUndefinedKeyword(node)) return primaryType('undefined')
  if (t.isTSObjectKeyword(node)) {
    return primaryType('Record<string, unknown>')
  }

  if (t.isTSLiteralType(node)) {
    if (t.isStringLiteral(node.literal)) {
      return primaryType(JSON.stringify(node.literal.value))
    }
    if (t.isNumericLiteral(node.literal) || t.isBooleanLiteral(node.literal)) {
      return primaryType(String(node.literal.value))
    }
    return undefined
  }

  if (t.isTSArrayType(node)) {
    const element = formatPortableType(
      node.elementType,
      formatNamedType,
      hasNamedType,
    )
    return element
      ? primaryTypeWithinLimit(`Array<${element.text}>`)
      : undefined
  }

  if (t.isTSTupleType(node)) {
    const elements = node.elementTypes.map(element =>
      formatTupleElement(element, formatNamedType, hasNamedType),
    )
    if (!elements.every((element): element is string => Boolean(element))) {
      return undefined
    }
    const text = joinWithinLimit(elements, ', ', 2)
    return text !== undefined ? primaryType(`[${text}]`) : undefined
  }

  if (t.isTSOptionalType(node)) {
    const type = formatPortableType(
      node.typeAnnotation,
      formatNamedType,
      hasNamedType,
    )
    return type
      ? primaryTypeWithinLimit(
          `${formatTypeAtPrecedence(type, TypePrecedence.Primary)}?`,
        )
      : undefined
  }

  if (t.isTSRestType(node)) {
    const type = formatPortableType(
      node.typeAnnotation,
      formatNamedType,
      hasNamedType,
    )
    return type
      ? primaryTypeWithinLimit(
          `...${formatTypeAtPrecedence(type, TypePrecedence.Primary)}`,
        )
      : undefined
  }

  if (t.isTSUnionType(node) || t.isTSIntersectionType(node)) {
    const precedence = t.isTSUnionType(node)
      ? TypePrecedence.Union
      : TypePrecedence.Intersection
    const types = node.types.map(type => {
      const formatted = formatPortableType(type, formatNamedType, hasNamedType)
      return formatted
        ? formatTypeAtPrecedence(formatted, precedence)
        : undefined
    })
    if (!types.every((type): type is string => Boolean(type))) return undefined
    const separator = t.isTSUnionType(node) ? ' | ' : ' & '
    const text = joinWithinLimit(types, separator)
    if (text === undefined) return undefined
    return {
      text,
      precedence,
    }
  }

  if (t.isTSParenthesizedType(node)) {
    const type = formatPortableType(
      node.typeAnnotation,
      formatNamedType,
      hasNamedType,
    )
    return type ? primaryTypeWithinLimit(`(${type.text})`) : undefined
  }

  if (t.isTSTypeOperator(node) && node.operator === 'readonly') {
    if (t.isTSArrayType(node.typeAnnotation)) {
      const element = formatPortableType(
        node.typeAnnotation.elementType,
        formatNamedType,
        hasNamedType,
      )
      return element
        ? primaryTypeWithinLimit(`ReadonlyArray<${element.text}>`)
        : undefined
    }

    if (t.isTSTupleType(node.typeAnnotation)) {
      const type = formatPortableType(
        node.typeAnnotation,
        formatNamedType,
        hasNamedType,
      )
      return type ? primaryTypeWithinLimit(`readonly ${type.text}`) : undefined
    }

    return undefined
  }

  if (t.isTSFunctionType(node)) {
    if (node.typeParameters?.params.length) return undefined

    const parameters = formatFunctionParameters(
      node.params,
      formatNamedType,
      hasNamedType,
    )
    const result = node.returnType
      ? formatPortableType(
          node.returnType.typeAnnotation,
          formatNamedType,
          hasNamedType,
        )
      : undefined
    if (parameters === undefined || !result) return undefined
    const text = `(${parameters}) => ${result.text}`
    return text.length <= MAX_PORTABLE_TYPE_LENGTH
      ? { text, precedence: TypePrecedence.Function }
      : undefined
  }

  if (t.isTSTypeLiteral(node)) {
    const props: Record<string, Partial<ComponentProp>> = {}

    for (const member of node.members) {
      if (!t.isTSPropertySignature(member) || member.computed) return undefined
      const key = getObjectKey(member.key as t.Expression)
      if (!key) return undefined
      if (hasOwnProp(props, key)) return undefined
      props[key] = extractTsProperty(member, formatNamedType, hasNamedType)
    }

    const text = formatPropMap(props)
    return text ? primaryType(text) : undefined
  }

  if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
    const name = node.typeName.name
    const params = node.typeArguments?.params ?? []

    if (hasNamedType(name)) {
      return formatNamedType(name)
    }

    if (isPortableTypeReference(name)) {
      const types = params.map(param =>
        formatPortableType(param, formatNamedType, hasNamedType),
      )
      if (!types.every((type): type is FormattedType => Boolean(type)))
        return undefined
      if (!types.length) return primaryType(name)
      const formattedParams = joinWithinLimit(
        types.map(type => type.text),
        ', ',
        name.length + 2,
      )
      return formattedParams
        ? primaryType(`${name}<${formattedParams}>`)
        : undefined
    }

    return undefined
  }

  return undefined
}

function formatFunctionParameters(
  parameters: t.TSFunctionType['params'],
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): string | undefined {
  const result: string[] = []

  for (const parameter of parameters) {
    const rest = t.isRestElement(parameter)
    const target = rest ? parameter.argument : parameter
    if (!t.isIdentifier(target)) return undefined

    const typeAnnotation = rest
      ? parameter.typeAnnotation
      : target.typeAnnotation
    if (!t.isTSTypeAnnotation(typeAnnotation)) return undefined

    const type = formatPortableType(
      typeAnnotation.typeAnnotation,
      formatNamedType,
      hasNamedType,
    )
    if (!type) return undefined

    result.push(
      `${rest ? '...' : ''}${target.name}${target.optional ? '?' : ''}: ${type.text}`,
    )
  }

  return joinWithinLimit(result, ', ')
}

function formatTupleElement(
  element: t.TSType | t.TSNamedTupleMember,
  formatNamedType: FormatNamedType,
  hasNamedType: HasNamedType,
): string | undefined {
  if (!t.isTSNamedTupleMember(element)) {
    return formatPortableType(element, formatNamedType, hasNamedType)?.text
  }

  const type = formatPortableType(
    element.elementType,
    formatNamedType,
    hasNamedType,
  )
  return type
    ? `${element.label.name}${element.optional ? '?' : ''}: ${type.text}`
    : undefined
}

function primaryType(text: string): FormattedType {
  return { text, precedence: TypePrecedence.Primary }
}

function primaryTypeWithinLimit(text: string): FormattedType | undefined {
  return text.length <= MAX_PORTABLE_TYPE_LENGTH ? primaryType(text) : undefined
}

function joinWithinLimit(
  parts: readonly string[],
  separator: string,
  surroundingLength = 0,
): string | undefined {
  let length = surroundingLength

  for (const [index, part] of parts.entries()) {
    length += part.length + (index ? separator.length : 0)
    if (length > MAX_PORTABLE_TYPE_LENGTH) return undefined
  }

  return parts.join(separator)
}

function formatTypeAtPrecedence(
  type: FormattedType,
  minimum: TypePrecedence,
): string {
  return type.precedence < minimum ? `(${type.text})` : type.text
}

function formatPropMap(
  props: Record<string, Partial<ComponentProp>>,
): string | undefined {
  const fields: string[] = []
  let length = 4

  for (const [name, prop] of Object.entries(props)) {
    if (
      prop.declaration === undefined &&
      prop.type === 'unknown' &&
      !prop.values?.length
    ) {
      return undefined
    }

    const type = prop.declaration?.type ?? fallbackPropType(prop)
    const readonly = (prop as ExtractedComponentProp).readonly
      ? 'readonly '
      : ''
    const field = `${readonly}${formatPropertyName(name)}${prop.required === false ? '?' : ''}: ${type}`
    length += field.length + (fields.length ? 2 : 0)

    if (length > MAX_PORTABLE_TYPE_LENGTH) return undefined
    fields.push(field)
  }

  return `{ ${fields.join('; ')} }`
}

function mergeUniqueProps(
  target: Record<string, Partial<ComponentProp>>,
  source: Record<string, Partial<ComponentProp>>,
): boolean {
  for (const key of Object.keys(source)) {
    if (hasOwnProp(target, key)) return false
  }

  Object.assign(target, source)
  return true
}

function hasOwnProp(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function fallbackPropType(prop: Partial<ComponentProp>): string {
  if (prop.values?.length) {
    return prop.values.map(value => JSON.stringify(value)).join(' | ')
  }

  switch (prop.type) {
    case 'string':
    case 'number':
    case 'boolean':
      return prop.type
    case 'array':
      return 'unknown[]'
    case 'object':
      return 'Record<string, unknown>'
    case 'function':
      return 'Function'
    default:
      return 'unknown'
  }
}

function formatPropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}
