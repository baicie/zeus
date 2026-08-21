import * as t from '@babel/types'

export const PORTABLE_GLOBAL_TYPE_REFERENCES = [
  'AbortSignal',
  'AddEventListenerOptions',
  'Array',
  'Blob',
  'CustomEvent',
  'Date',
  'Element',
  'Event',
  'EventListenerOptions',
  'EventListenerOrEventListenerObject',
  'File',
  'FocusEvent',
  'FormData',
  'Function',
  'HTMLElement',
  'InputEvent',
  'KeyboardEvent',
  'Map',
  'MouseEvent',
  'Node',
  'Omit',
  'Partial',
  'Pick',
  'PointerEvent',
  'Promise',
  'PromiseLike',
  'Readonly',
  'ReadonlyArray',
  'ReadonlyMap',
  'ReadonlySet',
  'Record',
  'Required',
  'Set',
  'URL',
  'UIEvent',
] as const

export type PortableGlobalTypeReference =
  (typeof PORTABLE_GLOBAL_TYPE_REFERENCES)[number]

const portableGlobalTypeReferenceSet: ReadonlySet<string> = new Set(
  PORTABLE_GLOBAL_TYPE_REFERENCES,
)

export function isPortableTypeReference(
  name: string,
  sourceBoundNames: ReadonlySet<string> = new Set(),
): name is PortableGlobalTypeReference {
  return !sourceBoundNames.has(name) && portableGlobalTypeReferenceSet.has(name)
}

export function collectSourceBoundTypeNames(ast: t.File): Set<string> {
  const names = new Set<string>()

  for (const statement of ast.program.body) {
    if (t.isImportDeclaration(statement)) {
      for (const specifier of statement.specifiers) {
        names.add(specifier.local.name)
      }
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
      if (declaration.id) names.add(declaration.id.name)
      continue
    }

    if (t.isTSModuleDeclaration(declaration)) {
      if (t.isIdentifier(declaration.id)) names.add(declaration.id.name)
      if (t.isStringLiteral(declaration.id)) names.add(declaration.id.value)
    }
  }

  return names
}

export function withTypeParameterBindings(
  sourceBoundNames: ReadonlySet<string>,
  typeParameters:
    | t.TSTypeParameterDeclaration
    | t.TypeParameterDeclaration
    | null
    | undefined,
): ReadonlySet<string> {
  if (!typeParameters?.params.length) return sourceBoundNames

  const names = new Set(sourceBoundNames)

  for (const parameter of typeParameters.params) {
    const parameterName = parameter.name
    names.add(
      typeof parameterName === 'string' ? parameterName : parameterName.name,
    )
  }

  return names
}
