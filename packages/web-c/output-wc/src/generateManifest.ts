import type { ComponentManifest } from '@zeus-js/component-analyzer'

export function generateZeusComponentsManifest(
  manifest: ComponentManifest,
): string {
  validateComponentManifest(manifest)
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function validateComponentManifest(manifest: ComponentManifest): void {
  if (manifest?.schemaVersion !== 1) {
    throw new Error(
      '[ZEUS_WC_ABI_VERSION] Component manifest schemaVersion must be 1.',
    )
  }

  if (!Array.isArray(manifest.components)) {
    throw new Error(
      '[ZEUS_WC_INVALID_MANIFEST] Component manifest components must be an array.',
    )
  }

  const tags = new Set<string>()
  for (const [componentIndex, component] of manifest.components.entries()) {
    if (!component || typeof component.tag !== 'string') {
      throw new Error(
        `[ZEUS_WC_INVALID_MANIFEST] components[${componentIndex}].tag must be a string.`,
      )
    }
    if (tags.has(component.tag)) {
      throw new Error(
        `[ZEUS_WC_DUPLICATE_TAG] Component tag "${component.tag}" is declared more than once.`,
      )
    }
    tags.add(component.tag)
  }

  for (const [componentIndex, component] of manifest.components.entries()) {
    const componentPath = `components[${componentIndex}]`
    if (
      !component ||
      typeof component.tag !== 'string' ||
      typeof component.exportName !== 'string'
    ) {
      throw new Error(
        `[ZEUS_WC_INVALID_MANIFEST] ${componentPath} requires tag and exportName strings.`,
      )
    }

    const attributes = new Map<string, string>()
    for (const [propName, prop] of Object.entries(component.props ?? {})) {
      const attrName =
        prop.attr === false
          ? false
          : typeof prop.attr === 'string'
            ? prop.attr
            : ['string', 'number', 'boolean'].includes(prop.type)
              ? propName.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
              : false
      if (attrName !== false) {
        const previous = attributes.get(attrName)
        if (previous && previous !== propName) {
          throw new Error(
            `[ZEUS_WC_ATTR_COLLISION] ${componentPath}.props.${propName} and ${previous} both use attribute "${attrName}".`,
          )
        }
        attributes.set(attrName, propName)
      }
    }

    for (const [eventKey, event] of Object.entries(component.events ?? {})) {
      if (
        (event.name !== undefined && typeof event.name !== 'string') ||
        (event.reactName !== undefined &&
          typeof event.reactName !== 'string') ||
        (event.bubbles !== undefined && typeof event.bubbles !== 'boolean') ||
        (event.composed !== undefined && typeof event.composed !== 'boolean') ||
        (event.cancelable !== undefined &&
          typeof event.cancelable !== 'boolean')
      ) {
        throw new Error(
          `[ZEUS_WC_EVENT_ABI] ${componentPath}.events.${eventKey} contains invalid names or bubbles/composed/cancelable flags.`,
        )
      }
    }

    for (const [propName, prop] of Object.entries(component.props ?? {})) {
      if (
        prop.hasDefault !== undefined &&
        typeof prop.hasDefault !== 'boolean'
      ) {
        throw new Error(
          `[ZEUS_WC_INVALID_DEFAULT_META] ${componentPath}.props.${propName}.hasDefault must be boolean.`,
        )
      }
      if (
        prop.defaultStrategy !== undefined &&
        prop.defaultStrategy !== 'static' &&
        prop.defaultStrategy !== 'factory'
      ) {
        throw new Error(
          `[ZEUS_WC_INVALID_DEFAULT_META] ${componentPath}.props.${propName}.defaultStrategy is invalid.`,
        )
      }
      if (prop.defaultStrategy === 'factory' && prop.default !== undefined) {
        throw new Error(
          `[ZEUS_WC_INVALID_DEFAULT_META] ${componentPath}.props.${propName} factory defaults cannot be serialized as values.`,
        )
      }
      if (
        prop.defaultStrategy === 'static' &&
        !Object.prototype.hasOwnProperty.call(prop, 'default')
      ) {
        throw new Error(
          `[ZEUS_WC_INVALID_DEFAULT_META] ${componentPath}.props.${propName} static defaults require a value.`,
        )
      }
      if (Object.prototype.hasOwnProperty.call(prop, 'default')) {
        if (prop.default === undefined) {
          throw new Error(
            `[ZEUS_WC_INVALID_DEFAULT_META] ${componentPath}.props.${propName}.default cannot be undefined.`,
          )
        }
        assertJsonSafe(
          prop.default,
          `${componentPath}.props.${propName}.default`,
          new Set(),
          'ZEUS_WC_INVALID_DEFAULT_META',
          true,
        )
      }
    }
  }

  assertJsonSafe(manifest, 'manifest')
}

function assertJsonSafe(
  value: unknown,
  path: string,
  parents = new Set<object>(),
  code = 'ZEUS_WC_INVALID_MANIFEST',
  rejectUndefined = false,
): void {
  if (value === undefined) {
    if (rejectUndefined) {
      throw invalidManifest(path, 'undefined values are not supported', code)
    }
    return
  }
  if (value === null) return
  if (typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw invalidManifest(
        path,
        'numbers must be finite and cannot be -0',
        code,
      )
    }
    return
  }
  if (
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throw invalidManifest(
      path,
      'functions, symbols, and bigint values are not supported',
      code,
    )
  }
  if (typeof value !== 'object') {
    throw invalidManifest(path, 'value is not JSON-safe', code)
  }
  if (parents.has(value)) {
    throw invalidManifest(path, 'cyclic values are not supported', code)
  }

  const prototype = Object.getPrototypeOf(value)
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    throw invalidManifest(
      path,
      'only plain objects and arrays are supported',
      code,
    )
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw invalidManifest(path, 'symbol keys are not supported', code)
  }

  parents.add(value)
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if ('get' in descriptor || 'set' in descriptor) {
      throw invalidManifest(
        `${path}.${key}`,
        'accessor properties are not supported',
        code,
      )
    }
    if (descriptor.value === undefined && !rejectUndefined) continue
    assertJsonSafe(
      descriptor.value,
      Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`,
      parents,
      code,
      rejectUndefined,
    )
  }
  parents.delete(value)
}

function invalidManifest(path: string, reason: string, code: string): Error {
  return new Error(`[${code}] ${path}: ${reason}.`)
}
