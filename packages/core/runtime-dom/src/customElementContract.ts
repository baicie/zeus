export type CustomElementPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'unknown'

export interface CustomElementPropSchema {
  name: string
  attrName?: string | false
  type: CustomElementPropType
  reflect?: boolean
  serialize?: true | ((value: unknown) => string | null | undefined)
  deserialize?: true | ((value: string | null) => unknown)
}

export interface CustomElementMount {
  dispose(): void
}

export interface CustomElementMountLifecycle<M extends CustomElementMount> {
  connect(): M
  disconnect(): void
  current(): M | undefined
}

export function getCustomElementAttributeName(
  prop: CustomElementPropSchema,
): string | undefined {
  if (prop.attrName === false) return undefined

  if (!isAttributeBackedType(prop.type) && !prop.deserialize) {
    return undefined
  }

  return normalizeAttributeName(prop.attrName ?? toKebabCase(prop.name))
}

export function getCustomElementObservedAttributes(
  props: readonly CustomElementPropSchema[],
): string[] {
  const attributes = new Set<string>()

  for (const prop of props) {
    const attrName = getCustomElementAttributeName(prop)
    if (attrName) attributes.add(attrName)
  }

  return Array.from(attributes)
}

export function findCustomElementPropByAttribute(
  props: readonly CustomElementPropSchema[],
  attrName: string,
): CustomElementPropSchema | undefined {
  const normalizedName = normalizeAttributeName(attrName)

  return props.find(prop => {
    return getCustomElementAttributeName(prop) === normalizedName
  })
}

export function coerceCustomElementAttribute(
  prop: CustomElementPropSchema,
  value: string | null,
): unknown {
  if (typeof prop.deserialize === 'function') {
    return prop.deserialize(value)
  }

  if (prop.deserialize === true) {
    return value
  }

  switch (prop.type) {
    case 'boolean':
      return value !== null
    case 'number':
      return value === null ? undefined : Number(value)
    case 'string':
      return value ?? undefined
    case 'object':
    case 'array':
      return coerceStructuredAttribute(prop, value)
    case 'function':
      return undefined
    default:
      return value
  }
}

export function reflectCustomElementProperty(
  element: HTMLElement,
  prop: CustomElementPropSchema,
  value: unknown,
  reflectingAttrs?: Set<string>,
): void {
  const attrName = getCustomElementAttributeName(prop)

  if (!attrName || prop.serialize === true) return

  reflectingAttrs?.add(attrName)

  try {
    const serialized = serializeCustomElementProperty(prop, value)

    if (serialized == null) {
      element.removeAttribute(attrName)
    } else {
      element.setAttribute(attrName, serialized)
    }
  } finally {
    reflectingAttrs?.delete(attrName)
  }
}

export function createCustomElementMountLifecycle<M extends CustomElementMount>(
  mount: () => M,
): CustomElementMountLifecycle<M> {
  let mounted: M | undefined

  return {
    connect() {
      mounted ??= mount()
      return mounted
    },
    disconnect() {
      const current = mounted
      mounted = undefined
      current?.dispose()
    },
    current() {
      return mounted
    },
  }
}

function serializeCustomElementProperty(
  prop: CustomElementPropSchema,
  value: unknown,
): string | null | undefined {
  if (typeof prop.serialize === 'function') {
    return prop.serialize(value)
  }

  if (prop.type === 'boolean') {
    return value ? '' : null
  }

  if (value == null) return null

  if (prop.type === 'object' || prop.type === 'array') {
    return JSON.stringify(value)
  }

  if (prop.type === 'function') return undefined

  return String(value)
}

function coerceStructuredAttribute(
  prop: CustomElementPropSchema,
  value: string | null,
): unknown {
  if (value === null) return undefined

  try {
    return JSON.parse(value)
  } catch {
    if (__DEV__) {
      console.warn(
        `[Zeus custom-element] Failed to parse JSON attribute "${getCustomElementAttributeName(prop)}".`,
      )
    }

    return prop.type === 'array' ? [] : {}
  }
}

function isAttributeBackedType(type: CustomElementPropType): boolean {
  return type === 'string' || type === 'number' || type === 'boolean'
}

function normalizeAttributeName(value: string): string {
  return value.toLowerCase()
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
