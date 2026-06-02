import type {
  ComponentManifest,
  ComponentProp,
  ComponentRecord,
} from '@zeus-js/component-analyzer'

export interface CustomElementsManifest {
  schemaVersion: string
  readme?: string
  modules: CustomElementModule[]
}

export interface CustomElementModule {
  kind: 'javascript-module'
  path: string
  declarations: CustomElementDeclaration[]
  exports?: CustomElementExport[]
}

export interface CustomElementDeclaration {
  kind: 'class'
  name: string
  tagName: string
  customElement: true
  description?: string
  attributes?: CustomElementAttribute[]
  members?: CustomElementMember[]
  events?: CustomElementEvent[]
  slots?: CustomElementSlot[]
  cssParts?: CustomElementCssPart[]
  cssProperties?: CustomElementCssProperty[]
}

export interface CustomElementAttribute {
  name: string
  description?: string
  type?: {
    text: string
  }
  default?: string
}

export interface CustomElementMember {
  kind: 'field'
  name: string
  description?: string
  type?: {
    text: string
  }
  default?: string
}

export interface CustomElementEvent {
  name: string
  description?: string
  type?: {
    text: string
  }
}

export interface CustomElementSlot {
  name: string
  description?: string
}

export interface CustomElementCssPart {
  name: string
  description?: string
}

export interface CustomElementCssProperty {
  name: string
  description?: string
}

export interface CustomElementExport {
  kind: 'js'
  name: string
  declaration: {
    name: string
    module: string
  }
}

export interface GenerateCustomElementsOptions {
  manifest: ComponentManifest
  getModulePath: (component: ComponentRecord) => string
}

export function generateCustomElementsJson(
  options: GenerateCustomElementsOptions,
): string {
  const { manifest, getModulePath } = options

  const result: CustomElementsManifest = {
    schemaVersion: '1.0.0',
    modules: manifest.components.map(component => {
      const modulePath = normalizeModulePath(getModulePath(component))

      return {
        kind: 'javascript-module',
        path: modulePath,
        declarations: [
          {
            kind: 'class',
            name: `${component.name}Element`,
            tagName: component.tag,
            customElement: true,
            description: component.description,
            attributes: generateAttributes(component),
            members: generateMembers(component),
            events: generateEvents(component),
            slots: generateSlots(component),
            cssParts: component.cssParts.map(name => ({ name })),
            cssProperties: component.cssVars.map(name => ({ name })),
          },
        ],
        exports: [
          {
            kind: 'js',
            name: component.exportName,
            declaration: {
              name: `${component.name}Element`,
              module: modulePath,
            },
          },
        ],
      }
    }),
  }

  return `${JSON.stringify(result, null, 2)}\n`
}

function generateAttributes(
  component: ComponentRecord,
): CustomElementAttribute[] {
  const result: CustomElementAttribute[] = []

  for (const [name, prop] of Object.entries(component.props)) {
    const attrName = getAttributeName(name, prop)

    if (attrName === false) continue

    result.push({
      name: attrName,
      description: prop.description,
      type: {
        text: formatPropType(prop),
      },
      default:
        prop.default === undefined ? undefined : JSON.stringify(prop.default),
    })
  }

  return result
}

function generateMembers(component: ComponentRecord): CustomElementMember[] {
  return Object.entries(component.props).map(([name, prop]) => {
    return {
      kind: 'field' as const,
      name,
      description: prop.description,
      type: {
        text: formatPropType(prop),
      },
      default:
        prop.default === undefined ? undefined : JSON.stringify(prop.default),
    }
  })
}

function generateEvents(component: ComponentRecord): CustomElementEvent[] {
  return Object.entries(component.events).map(([name, event]) => {
    return {
      name,
      description: event.description,
      type: {
        text: event.detail
          ? `CustomEvent<${formatDetailType(event.detail)}>`
          : 'CustomEvent',
      },
    }
  })
}

function generateSlots(component: ComponentRecord): CustomElementSlot[] {
  return Object.entries(component.slots).map(([name, slot]) => {
    return {
      name: name === 'default' ? '' : name,
      description: slot.description,
    }
  })
}

function getAttributeName(
  propName: string,
  prop: ComponentProp,
): string | false {
  if (prop.attr === false) return false
  if (typeof prop.attr === 'string') return prop.attr

  return propName.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function formatPropType(prop: ComponentProp): string {
  if (prop.values?.length) {
    return prop.values.map(value => JSON.stringify(value)).join(' | ')
  }

  switch (prop.type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'unknown[]'
    case 'object':
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

function formatDetailType(detail: Record<string, string>): string {
  const fields = Object.entries(detail)
    .map(([name, type]) => `${name}: ${type}`)
    .join('; ')

  return `{ ${fields} }`
}

function normalizeModulePath(value: string): string {
  return value.replace(/\\/g, '/')
}
