import { ssrAttr, ssrElement } from './element'
import { createSSRFragment } from './serialize'

import type {
  SSRComponentManifest,
  SSRAttributeEntry,
  SSRCustomElementOptions,
  SSRDefineElementOptions,
  SSRFragment,
  SSRManifestProp,
  SSRNode,
  SSRShadowRootOptions,
} from './types'

const HYDRATION_MARKER_PREFIX = 'zeus:hydrate:'
const RESERVED_CUSTOM_ELEMENT_NAMES = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
])
// SSR tags are compiler-owned identifiers. Keep the accepted grammar explicit
// so an invalid tag can never be interpolated into the HTML serializer.
const CUSTOM_ELEMENT_NAME = /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/

/** Emits a stable, comment-only marker consumed by the opt-in DOM hydrator. */
export function ssrHydrationMarker(id: string): SSRFragment {
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw new TypeError(`Invalid hydration marker id: ${JSON.stringify(id)}.`)
  }
  return createSSRFragment(`<!--${HYDRATION_MARKER_PREFIX}${id}-->`)
}

/**
 * Serializes a custom-element host and, when requested, a Declarative Shadow
 * DOM template. The runtime never registers a custom element during SSR.
 */
export function ssrCustomElement(
  tag: string,
  options: SSRCustomElementOptions = {},
): SSRFragment {
  assertCustomElementTag(tag)
  const attributes: readonly SSRAttributeEntry[] = options.attributes ?? []
  const children: SSRNode[] = []

  if (options.shadowRoot !== undefined) {
    const shadowOptions = options.shadowRootOptions ?? { mode: 'open' }
    children.push(shadowRootTemplate(options.shadowRoot, shadowOptions))
  }

  if (options.children !== undefined) children.push(options.children)
  return ssrElement(tag, attributes, children)
}

/**
 * Renders a custom element definition in a server-only environment. The
 * setup function is evaluated once and never registers a browser element.
 */
export function defineElement<P extends Record<string, unknown>>(
  tag: string,
  options: SSRDefineElementOptions = {},
  setup: (props: Readonly<P>, context: SSRDefineElementContext) => SSRNode,
): (props?: P) => SSRFragment {
  assertCustomElementTag(tag)
  return (input = {} as P) => {
    const props = resolveDefineProps(input, options.props)
    const shadowRootOptions = resolveShadowOptions(options.shadow)
    const mode = shadowRootOptions ? 'shadow' : 'light'
    const context: SSRHostContext = {
      mode,
      attributes: [],
      children: props.children,
      lightChildren: flattenLightChildren(props.children),
      claimedLightChildren: new Set(),
    }
    return withHostContext(context, () => {
      const content = setup(props, {
        host: undefined,
        internals: undefined,
        emit: () => false,
        expose: () => {},
      })
      const attributes = mergeHostAttributes([
        ...manifestHostAttributes(options.props, props, input),
        ...context.attributes,
      ])
      const styles = normalizeStyles(options.styles)
      const shadowContent = styles.length
        ? [ssrElement('style', [], styles.join('\n')), content]
        : content
      return ssrCustomElement(tag, {
        attributes,
        shadowRoot: shadowRootOptions ? shadowContent : undefined,
        shadowRootOptions,
        children: mode === 'shadow' ? props.children : content,
      })
    })
  }
}

export interface SSRDefineElementContext {
  readonly host: undefined
  readonly internals: undefined
  readonly emit: (...args: unknown[]) => boolean
  readonly expose: (methods: Record<string, Function>) => void
}

interface SSRHostContext {
  readonly mode: 'shadow' | 'light'
  readonly attributes: SSRAttributeEntry[]
  readonly children: SSRNode
  readonly lightChildren: readonly LightChild[]
  readonly claimedLightChildren: Set<string>
}

interface LightChild {
  readonly path: string
  readonly node: SSRNode
  readonly slotName?: string
}

let currentHostContext: SSRHostContext | undefined

/** Compiler intrinsic for a custom-element host boundary. */
export function Host(props: Record<string, unknown> = {}): SSRNode {
  const context = currentHostContext
  if (!context) return props.children as SSRNode
  for (const [name, value] of Object.entries(props)) {
    if (name === 'children') continue
    // Host uses the same property/event channels as DOM spreads. These values
    // are client-only and must not become attributes in server HTML.
    if (
      name === 'ref' ||
      name.startsWith('prop:') ||
      (name.length > 2 && /^on/i.test(name))
    ) {
      continue
    }
    const resolved = isHostAccessor(name, value) ? value() : value
    context.attributes.push(ssrAttr(name, resolved as never))
  }
  return props.children as SSRNode
}

function isHostAccessor(key: string, value: unknown): value is () => unknown {
  return (
    typeof value === 'function' &&
    key !== 'ref' &&
    !key.startsWith('prop:') &&
    !(key.length > 2 && /^on/i.test(key))
  )
}

/** Compiler intrinsic for shadow slots and light-DOM default projection. */
export function Slot(
  props: { name?: string; children?: SSRNode } = {},
): SSRNode {
  const context = currentHostContext
  if (!context || context.mode === 'shadow') {
    const attrs = props.name ? [ssrAttr('name', props.name)] : []
    return ssrElement('slot', attrs, props.children ?? null)
  }
  const projected = projectLightChildren(context, props.name)
  return projected === null ? (props.children ?? null) : projected
}

function projectLightChildren(
  context: SSRHostContext,
  slotName: string | undefined,
): SSRNode | null {
  const projected = context.lightChildren
    .filter(child => child.slotName === slotName)
    .filter(child => {
      if (context.claimedLightChildren.has(child.path)) return false
      context.claimedLightChildren.add(child.path)
      return true
    })
    .map(child => child.node)
  return projected.length ? projected : null
}

function flattenLightChildren(value: SSRNode, path = '0'): LightChild[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      flattenLightChildren(child, `${path}.${index}`),
    )
  }
  if (isSSRFragmentNode(value)) {
    if (/^\s*$/.test(value.html)) return []
    return [{ path, node: value, slotName: value.slotName }]
  }
  if (value == null || typeof value === 'boolean') return []
  if (typeof value === 'string' && !value.trim()) return []
  return [{ path, node: value }]
}

function isSSRFragmentNode(value: SSRNode): value is SSRFragment {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'html' in value &&
    typeof value.html === 'string'
  )
}

/** Applies generated manifest defaults and primitive host-attribute policy. */
export function ssrComponentFromManifest<P extends Record<string, unknown>>(
  manifest: SSRComponentManifest,
  tag: string,
  props: P = {} as P,
  setup: (props: Readonly<P>) => SSRNode = () => null,
): SSRFragment {
  if (manifest.schemaVersion !== 1) {
    throw new Error('[ZEUS_SSR_MANIFEST_VERSION] Expected schemaVersion 1.')
  }
  const component = manifest.components.find(entry => entry.tag === tag)
  if (!component) {
    throw new Error(`[ZEUS_SSR_MANIFEST_MISSING] Unknown component <${tag}>.`)
  }
  const options: SSRDefineElementOptions = {
    shadow: component.meta?.shadow,
    props: component.props,
  }
  return defineElement(tag, options, (resolved, context) => {
    const content = setup(resolved as Readonly<P>)
    return Host({ children: content })
  })(props)
}

function resolveDefineProps<P extends Record<string, unknown>>(
  input: P,
  definitions: SSRDefineElementOptions['props'],
): P & { children?: SSRNode } {
  const resolved: Record<string, unknown> = { ...input }
  for (const [name, definition] of Object.entries(definitions ?? {})) {
    if (name in resolved) continue
    const metadata = typeof definition === 'function' ? undefined : definition
    if (metadata?.defaultStrategy === 'factory') {
      throw new TypeError(
        `[ZEUS_SSR_DEFAULT_FACTORY_UNSUPPORTED] Prop "${name}" uses a factory default; provide an explicit SSR prop or a static default.`,
      )
    }
    if (metadata && Object.prototype.hasOwnProperty.call(metadata, 'default')) {
      if (typeof metadata.default === 'function') {
        throw new TypeError(
          `[ZEUS_SSR_DEFAULT_FACTORY_UNSUPPORTED] Prop "${name}" uses a factory default; provide an explicit SSR prop or a static default.`,
        )
      }
      resolved[name] = metadata.default
    }
  }
  return resolved as P & { children?: SSRNode }
}

function manifestHostAttributes(
  definitions: SSRDefineElementOptions['props'],
  props: Record<string, unknown>,
  input: Record<string, unknown>,
): SSRAttributeEntry[] {
  const entries: SSRAttributeEntry[] = []
  for (const [name, definition] of Object.entries(definitions ?? {})) {
    const metadata = normalizePropDefinition(definition)
    const value = props[name]
    if (
      !metadata ||
      metadata.attr === false ||
      (!Object.prototype.hasOwnProperty.call(input, name) &&
        !metadata.reflect) ||
      !isPrimitive(value)
    )
      continue
    const attr = typeof metadata.attr === 'string' ? metadata.attr : kebab(name)
    entries.push(ssrAttr(attr, value as never))
  }
  return entries
}

function normalizePropDefinition(
  definition: SSRManifestProp | Function,
): SSRManifestProp | undefined {
  if (typeof definition !== 'function') return definition
  if (definition === String) return { type: 'string', reflect: true }
  if (definition === Number) return { type: 'number', reflect: true }
  if (definition === Boolean) return { type: 'boolean', reflect: true }
  return undefined
}

function mergeHostAttributes(
  attributes: readonly SSRAttributeEntry[],
): SSRAttributeEntry[] {
  const lastIndexByName = new Map<string, number>()
  attributes.forEach((attribute, index) => {
    if (attribute) lastIndexByName.set(attribute.name.toLowerCase(), index)
  })
  return attributes.filter(
    (attribute, index) =>
      !attribute || lastIndexByName.get(attribute.name.toLowerCase()) === index,
  )
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function normalizeStyles(
  styles: string | readonly string[] | undefined,
): string[] {
  if (styles === undefined) return []
  return typeof styles === 'string' ? [styles] : [...styles]
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function resolveShadowOptions(
  shadow: SSRDefineElementOptions['shadow'],
): SSRShadowRootOptions | undefined {
  if (!shadow) return undefined
  if (shadow === true) return { mode: 'open' }
  return shadow
}

function withHostContext<T>(context: SSRHostContext, fn: () => T): T {
  const previous = currentHostContext
  currentHostContext = context
  try {
    return fn()
  } finally {
    currentHostContext = previous
  }
}

function assertCustomElementTag(tag: string): void {
  if (
    typeof tag !== 'string' ||
    !CUSTOM_ELEMENT_NAME.test(tag) ||
    tag.startsWith('xml') ||
    RESERVED_CUSTOM_ELEMENT_NAMES.has(tag)
  ) {
    throw new TypeError(
      `[ZEUS_SSR_INVALID_TAG] Invalid custom element name: ${JSON.stringify(tag)}.`,
    )
  }
}

function shadowRootTemplate(
  content: SSRNode,
  options: SSRShadowRootOptions,
): SSRFragment {
  const attributes: SSRAttributeEntry[] = [
    { name: 'shadowrootmode', value: options.mode },
  ]
  if (options.delegatesFocus) {
    attributes.push({ name: 'shadowrootdelegatesfocus', value: true })
  }
  if (options.serializable) {
    attributes.push({ name: 'shadowrootserializable', value: true })
  }
  return ssrElement('template', attributes, content)
}
