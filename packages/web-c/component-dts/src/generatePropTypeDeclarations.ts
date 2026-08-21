import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GeneratedPropTypeDeclarations {
  code: string
  components: readonly ComponentRecord[]
}

export interface GeneratePropTypeDeclarationsOptions {
  exported?: boolean
  reservedNames?: ReadonlySet<string>
}

export function generatePropTypeDeclarations(
  components: readonly ComponentRecord[],
  options: GeneratePropTypeDeclarationsOptions = {},
): GeneratedPropTypeDeclarations {
  const declarations = new Map<string, string>()
  const conflicts = new Set<string>()

  for (const component of components) {
    for (const prop of Object.values(component.props)) {
      const declaration = prop.declaration
      const reference = declaration?.reference
      if (!reference) continue

      const existing = declarations.get(reference)
      if (existing && existing !== declaration.type) {
        conflicts.add(reference)
        continue
      }

      declarations.set(reference, declaration.type)
    }
  }

  for (const reference of conflicts) {
    declarations.delete(reference)
  }

  const allocatedNames = allocateDeclarationNames(
    declarations.keys(),
    options.reservedNames,
  )
  const normalizedComponents = components.map(component =>
    normalizeDeclarations(component, conflicts, allocatedNames),
  )
  const declarationPrefix = options.exported === false ? 'type' : 'export type'

  return {
    code: Array.from(declarations, ([name, type]) => {
      return `${declarationPrefix} ${allocatedNames.get(name)!} = ${type}`
    }).join('\n'),
    components: normalizedComponents,
  }
}

function allocateDeclarationNames(
  references: Iterable<string>,
  reservedNames: ReadonlySet<string> | undefined,
): Map<string, string> {
  const sourceNames = Array.from(references)
  const used = new Set(reservedNames)
  const result = new Map<string, string>()

  for (const name of sourceNames) {
    if (!used.has(name)) used.add(name)
  }

  for (const name of sourceNames) {
    if (!reservedNames?.has(name)) {
      result.set(name, name)
      continue
    }

    const base = `${name}PropType`
    let candidate = base
    let suffix = 2

    while (used.has(candidate)) {
      candidate = `${base}${suffix}`
      suffix += 1
    }

    used.add(candidate)
    result.set(name, candidate)
  }

  return result
}

function normalizeDeclarations(
  component: ComponentRecord,
  conflicts: ReadonlySet<string>,
  allocatedNames: ReadonlyMap<string, string>,
): ComponentRecord {
  let changed = false
  const props = Object.fromEntries(
    Object.entries(component.props).map(([name, prop]) => {
      const declaration = prop.declaration

      if (!declaration?.reference) {
        return [name, prop]
      }

      const reference = declaration.reference
      const allocatedName = allocatedNames.get(reference)

      if (!conflicts.has(reference) && allocatedName === reference) {
        return [name, prop]
      }

      changed = true
      return [
        name,
        {
          ...prop,
          declaration: conflicts.has(reference)
            ? { type: declaration.type }
            : { ...declaration, reference: allocatedName },
        },
      ]
    }),
  )

  return changed ? { ...component, props } : component
}
