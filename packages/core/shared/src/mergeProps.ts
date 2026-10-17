export type PropsSource = () => unknown

export function normalizeDOMAttributeName(name: string): string {
  switch (name) {
    case 'className':
      return 'class'
    case 'htmlFor':
      return 'for'
    case 'tabIndex':
      return 'tabindex'
    case 'readOnly':
      return 'readonly'
    default:
      return name
  }
}

export function normalizeDOMProps(source: unknown): Record<string, unknown> {
  const props = Object.create(null) as Record<string, unknown>
  if (source == null) return props
  const value = Object(source) as Record<string, unknown>
  for (const key of Object.keys(value)) {
    const normalized =
      /^on/i.test(key) && key.length > 2
        ? key.toLowerCase()
        : normalizeDOMAttributeName(key)
    delete props[normalized]
    props[normalized] = value[key]
  }
  return props
}

// Keep each binding at its last source position. Attribute/property channels
// can affect the same DOM state, so object key insertion order is insufficient.
export function resolveDOMProps(
  sources: readonly unknown[],
): Map<string, unknown> {
  const props = new Map<string, unknown>()
  for (const source of sources) {
    const values = normalizeDOMProps(source)
    for (const key of Object.keys(values)) {
      props.delete(key)
      props.set(key, values[key])
    }
  }
  return props
}

// Read through source layers rather than copying values at component setup.
// This preserves property getters, reactive keys, and source replacement.
export function mergeProps<T extends object = Record<string, unknown>>(
  sources: readonly PropsSource[],
): T {
  const readSources = () =>
    sources.map(source => {
      const value = source()
      return value == null ? undefined : (Object(value) as object)
    })
  const find = (key: PropertyKey) => {
    const values = readSources()
    for (let index = values.length - 1; index >= 0; index--) {
      const value = values[index]
      if (
        value &&
        Reflect.has(value, key) &&
        Object.prototype.propertyIsEnumerable.call(value, key)
      ) {
        return value
      }
    }
  }
  return new Proxy(Object.create(null) as T, {
    get(_target, key) {
      const source = find(key)
      return source ? Reflect.get(source, key) : undefined
    },
    has(_target, key) {
      return find(key) !== undefined
    },
    ownKeys() {
      const keys = new Set<string | symbol>()
      for (const source of readSources()) {
        if (!source) continue
        for (const key of Reflect.ownKeys(source)) {
          if (Object.prototype.propertyIsEnumerable.call(source, key))
            keys.add(key)
        }
      }
      return [...keys]
    },
    getOwnPropertyDescriptor(_target, key) {
      if (!find(key)) return undefined
      return {
        configurable: true,
        enumerable: true,
        get: () => {
          const source = find(key)
          return source ? Reflect.get(source, key) : undefined
        },
      }
    },
    set() {
      return false
    },
    defineProperty() {
      return false
    },
    deleteProperty() {
      return false
    },
  })
}
