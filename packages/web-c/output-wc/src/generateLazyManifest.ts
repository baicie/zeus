// packages/web-c/output-wc/src/generateLazyManifest.ts
// Generates components.manifest.js for lazy loading mode

import type {
  ComponentProp,
  ComponentRecord,
} from '@zeus-js/component-analyzer'

export interface GenerateLazyManifestOptions {
  components: ComponentRecord[]
  getEntryFileName: (tag: string) => string
  tagPrefix?: string
}

export function generateLazyManifest(
  options: GenerateLazyManifestOptions,
): string {
  const { components, getEntryFileName } = options

  const componentEntries = components.map(component => {
    const entryFile = getEntryFileName(component.tag).replace(/\\/g, '/')
    const runtimeProps = component.runtimeProps ?? component.props
    const props = generatePropsArray(runtimeProps)
    const methods = Object.keys(component.methods ?? {})

    const importPath = entryFile.startsWith('.')
      ? JSON.stringify(entryFile)
      : JSON.stringify(`./${entryFile}`)

    const methodLine = methods.length
      ? `    methods: ${JSON.stringify(methods)},\n`
      : ''

    return `  {
    tagName: ${JSON.stringify(component.tag)},
    shadow: ${component.meta?.shadow ?? false},
    formAssociated: ${component.meta?.formAssociated ?? false},
    load: () => import(${importPath}),
    props: ${props},
${methodLine}
  }`
  })

  return `export const components = [
${componentEntries.join(',\n')}
];
`
}

function generatePropsArray(props: Record<string, ComponentProp>): string {
  const entries = Object.entries(props)

  if (entries.length === 0) {
    return '[]'
  }

  const lines = entries.map(([name, prop]) => {
    const parts: string[] = [`name: ${JSON.stringify(name)}`]

    if (
      (!isAttributeBackedType(prop.type) && !prop.deserialize) ||
      prop.attr === false
    ) {
      parts.push('attrName: false')
    } else {
      const attrName = prop.attr ?? toKebabCase(name)
      if (attrName !== toKebabCase(name)) {
        parts.push(`attrName: ${JSON.stringify(attrName)}`)
      }
    }

    parts.push(`type: ${JSON.stringify(prop.type)}`)

    if (isJsonSafeDefault(prop.default)) {
      const encoded = JSON.stringify(prop.default)
      parts.push(
        `default: ${typeof prop.default === 'object' && prop.default !== null ? `JSON.parse(${JSON.stringify(encoded)})` : encoded}`,
      )
    }

    if (
      prop.reflect &&
      (isAttributeBackedType(prop.type) || Boolean(prop.serialize))
    ) {
      parts.push('reflect: true')
    }

    if (prop.serialize) {
      parts.push('serialize: true')
    }

    if (prop.deserialize) {
      parts.push('deserialize: true')
    }

    return `      { ${parts.join(', ')} }`
  })

  return `[\n${lines.join(',\n')}\n    ]`
}

function isJsonSafeDefault(
  value: unknown,
  parents = new Set<object>(),
): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true
  if (typeof value === 'number')
    return Number.isFinite(value) && !Object.is(value, -0)
  if (typeof value !== 'object' || parents.has(value)) return false
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false
  if (Object.getOwnPropertySymbols(value).length) return false

  parents.add(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const valid = Array.isArray(value)
    ? Array.from(
        { length: value.length },
        (_, index) => descriptors[index],
      ).every(
        descriptor =>
          descriptor &&
          'value' in descriptor &&
          isJsonSafeDefault(descriptor.value, parents),
      )
    : Object.values(descriptors).every(
        descriptor =>
          'value' in descriptor && isJsonSafeDefault(descriptor.value, parents),
      )
  parents.delete(value)
  return valid
}

function isAttributeBackedType(type: ComponentProp['type']): boolean {
  return type === 'string' || type === 'number' || type === 'boolean'
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
