import { assertSyncSSRValue } from './serialize'

import type { SSRAttribute, SSRAttributeEntry, SSRNode } from './types'

const SSR_PROPERTY = Symbol.for('zeus.ssr.property')
const SSR_ATTRIBUTE_REMOVAL = Symbol.for('zeus.ssr.attribute-removal')

interface SSRAttributeRemoval extends SSRAttribute {
  readonly [SSR_ATTRIBUTE_REMOVAL]: boolean
}

export function createSSRAttributeRemoval(
  name: string,
  property = false,
): SSRAttribute {
  return {
    name,
    value: '',
    [SSR_ATTRIBUTE_REMOVAL]: property,
  } as SSRAttributeRemoval
}

type SSRPropertyValue = string | number | boolean

interface SSRPropertyAttribute extends SSRAttribute {
  readonly [SSR_PROPERTY]: true
  readonly propertyValue: SSRPropertyValue | null
}

interface ResolvedSSRElementEntries {
  readonly attributes: SSRAttribute[]
  readonly children: SSRNode
}

type SSRPropertySerialization =
  | { readonly kind: 'boolean-attribute'; readonly name: string }
  | { readonly kind: 'string-attribute'; readonly name: string }
  | { readonly kind: 'text-content' }

const BOOLEAN_PROPERTY_ELEMENTS = {
  checked: new Set(['input']),
  disabled: new Set([
    'button',
    'fieldset',
    'input',
    'optgroup',
    'option',
    'select',
    'textarea',
  ]),
  multiple: new Set(['input', 'select']),
  readOnly: new Set(['input', 'textarea']),
  selected: new Set(['option']),
} satisfies Record<string, ReadonlySet<string>>

const VALUE_PROPERTY_ELEMENTS = new Set(['button', 'input', 'option'])

/**
 * Whether the property can be serialized is decided per element in
 * `resolveSSRElementProperties`, because a spread reaches here before the tag
 * is known.
 *
 * `null` and `undefined` are accepted: like the client `bindProp` channel,
 * writing them clears the state the property controls, so the server must not
 * keep an equivalent static attribute or the textarea's JSX children.
 */
export function createSSRProperty(
  name: string,
  value: unknown,
): SSRAttributeEntry {
  assertSyncSSRValue(value)
  if (value === null || value === undefined) {
    return {
      [SSR_PROPERTY]: true,
      name,
      propertyValue: null,
      value: '',
    } as unknown as SSRPropertyAttribute
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return null
  }

  return {
    [SSR_PROPERTY]: true,
    name,
    propertyValue: value,
    value: value === true ? true : String(value),
  } as SSRPropertyAttribute
}

export function resolveSSRElementProperties(
  tag: string,
  entries: readonly SSRAttributeEntry[],
  children: SSRNode,
): ResolvedSSRElementEntries {
  const attributes: SSRAttribute[] = []
  // Custom element properties are client-only: the server renders the host
  // tag and the element receives its properties after upgrade or hydration.
  const customElement = tag.includes('-')
  let resolvedChildren = children
  for (const entry of entries) {
    assertSyncSSRValue(entry)
    if (!entry) continue
    assertSyncSSRValue(entry.value)
    if (SSR_ATTRIBUTE_REMOVAL in entry) {
      if (!(entry as SSRAttributeRemoval)[SSR_ATTRIBUTE_REMOVAL]) {
        removeAttribute(attributes, entry.name)
        continue
      }
      if (customElement) continue
      const serialization = getSSRPropertySerialization(tag, entry.name)
      if (!serialization)
        throw new TypeError(
          `SSR cannot serialize property "${entry.name}" on <${tag}>.`,
        )
      if (serialization.kind === 'text-content') resolvedChildren = null
      else removeAttribute(attributes, serialization.name)
      continue
    }
    if (!isSSRProperty(entry)) {
      removeAttribute(attributes, entry.name)
      attributes.push(entry)
      continue
    }
    if (customElement) continue
    const property = entry
    const serialization = getSSRPropertySerialization(tag, property.name)
    if (!serialization) {
      throw new TypeError(
        `SSR cannot serialize property "${property.name}" on <${tag}>.`,
      )
    }

    if (serialization.kind === 'text-content') {
      removeAttribute(attributes, 'value')
      resolvedChildren =
        property.propertyValue === null
          ? null
          : normalizeTextareaValue(property.propertyValue)
      continue
    }

    removeAttribute(attributes, serialization.name)
    if (serialization.kind === 'boolean-attribute') {
      if (property.propertyValue === true) {
        attributes.push({ name: serialization.name, value: true })
      }
      continue
    }

    attributes.push({
      name: serialization.name,
      value:
        property.propertyValue === null
          ? ''
          : property.name === 'tabIndex'
            ? normalizeTabIndex(property.propertyValue)
            : String(property.propertyValue),
    })
  }

  return { attributes, children: resolvedChildren }
}

function getSSRPropertySerialization(
  tag: string,
  name: string,
): SSRPropertySerialization | undefined {
  const normalizedTag = tag.toLowerCase()

  // `defaultValue`/`defaultChecked` are the initial state the HTML attribute
  // defines, so they serialize exactly like the equivalent attribute. The
  // live `value`/`checked` properties are the ones with reflection semantics.
  if (name === 'defaultValue') {
    if (normalizedTag === 'textarea') return { kind: 'text-content' }
    return VALUE_PROPERTY_ELEMENTS.has(normalizedTag)
      ? { kind: 'string-attribute', name: 'value' }
      : undefined
  }
  if (name === 'defaultChecked') {
    return normalizedTag === 'input'
      ? { kind: 'boolean-attribute', name: 'checked' }
      : undefined
  }
  if (name === 'tabIndex') {
    return { kind: 'string-attribute', name: 'tabindex' }
  }
  if (name === 'htmlFor') {
    return normalizedTag === 'label'
      ? { kind: 'string-attribute', name: 'for' }
      : undefined
  }
  if (name === 'value') {
    if (normalizedTag === 'textarea') return { kind: 'text-content' }
    return VALUE_PROPERTY_ELEMENTS.has(normalizedTag)
      ? { kind: 'string-attribute', name: 'value' }
      : undefined
  }

  const elements =
    BOOLEAN_PROPERTY_ELEMENTS[name as keyof typeof BOOLEAN_PROPERTY_ELEMENTS]
  if (!elements?.has(normalizedTag)) return undefined
  return {
    kind: 'boolean-attribute',
    name: name === 'readOnly' ? 'readonly' : name,
  }
}

function isSSRProperty(
  attribute: SSRAttribute,
): attribute is SSRPropertyAttribute {
  return (attribute as SSRPropertyAttribute)[SSR_PROPERTY] === true
}

function removeAttribute(attributes: SSRAttribute[], name: string): void {
  const normalizedName = name.toLowerCase()
  for (let index = attributes.length - 1; index >= 0; index--) {
    if (attributes[index].name.toLowerCase() === normalizedName) {
      attributes.splice(index, 1)
    }
  }
}

function normalizeTabIndex(value: SSRPropertyValue): string {
  const number = Number(value)
  return String(Number.isFinite(number) ? Math.trunc(number) : 0)
}

function normalizeTextareaValue(value: SSRPropertyValue): string {
  const normalized = String(value).replace(/\r\n?/g, '\n')
  // HTML parsing drops the first newline immediately inside <textarea>.
  return normalized.startsWith('\n') ? `\n${normalized}` : normalized
}
