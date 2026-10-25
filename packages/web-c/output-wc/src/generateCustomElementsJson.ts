import { formatDetailType } from '@zeus-js/component-dts'

import { validateComponentManifest } from './generateManifest'

import type {
  ComponentMethod,
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
  kind: 'field' | 'method'
  name: string
  description?: string
  type?: {
    text: string
  }
  default?: string
  parameters?: CustomElementMethodParameter[]
  return?: {
    type: {
      text: string
    }
  }
}

export interface CustomElementMethodParameter {
  name: string
  type?: {
    text: string
  }
  optional?: boolean
  rest?: boolean
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
  validateComponentManifest(manifest)

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
            cssProperties: getCssVars(component).map(variable => ({
              name: variable.name,
              description: variable.description,
            })),
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
  const fields = Object.entries(component.props).map(([name, prop]) => {
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

  const methods = Object.entries(component.methods ?? {}).map(
    ([name, method]) => generateMethodMember(name, method),
  )

  return [...fields, ...methods]
}

function generateMethodMember(
  name: string,
  method: ComponentMethod,
): CustomElementMember {
  const member: CustomElementMember = {
    kind: 'method',
    name,
    return: {
      type: {
        text: method.async
          ? `Promise<${method.returns ?? 'unknown'}>`
          : (method.returns ?? 'unknown'),
      },
    },
  }

  if (method.parameters) {
    member.parameters = method.parameters.map(parameter => ({
      name: parameter.name,
      type: { text: parameter.type },
      optional: parameter.optional,
      rest: parameter.rest,
    }))
  }

  return member
}

function generateEvents(component: ComponentRecord): CustomElementEvent[] {
  return Object.entries(component.events).map(([key, event]) => {
    return {
      name: event.name ?? toKebabCase(event.key ?? key),
      description: event.description,
      type: {
        text: event.detail
          ? `CustomEvent<${formatDetailType(event.detail, event.detailOptional)}>`
          : 'CustomEvent',
      },
    }
  })
}

function generateSlots(component: ComponentRecord): CustomElementSlot[] {
  return Object.entries(component.slots).map(([key, slot]) => {
    const name = slot.name ?? key

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
  if (!isAttributeBackedType(prop.type)) return false

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
    case 'function':
      return 'Function'
    default:
      return 'unknown'
  }
}

function isAttributeBackedType(type: ComponentProp['type']): boolean {
  return type === 'string' || type === 'number' || type === 'boolean'
}

function normalizeModulePath(value: string): string {
  return value.replace(/\\/g, '/')
}

function getCssVars(
  component: ComponentRecord,
): Array<{ name: string; description?: string }> {
  return Object.values(component.cssVars)
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
