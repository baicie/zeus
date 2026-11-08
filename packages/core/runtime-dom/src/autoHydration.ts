import {
  LIGHT_DOM_ROOT_END_MARKER,
  LIGHT_DOM_ROOT_MARKER,
} from '@zeus-js/shared'

import { insertTracked } from './range'

/**
 * Automatic hydration (experimental, PR-17).
 *
 * A component compiled with the compiler's `autoHydrate` option emits two
 * bodies: an adopt body that reuses the server-rendered nodes behind stable
 * `<!--zeus:hydrate:ID-->` markers, and the ordinary create body.
 * `render(value, container, { hydrate: true })` opens one session for the
 * container; `autoHydrateComponent` runs the adopt body and turns a
 * `ZEUS_HYDRATION_*` failure into one scoped client rebuild of the component.
 *
 * Ownership boundaries (ADR-03/ADR-04):
 * - one live hydration owner per container; a second takeover fails;
 * - markers inside a shadow root are invisible to the outer session
 *   (`TreeWalker` does not cross shadow boundaries), and markers inside a
 *   server Light DOM block belong to that custom element, so they are skipped;
 * - dynamic regions (Show/For/Transition/expression children) are cleared and
 *   rebuilt inside a create frame instead of adopted. That boundary is
 *   documented as experimental: server content inside a region keeps no
 *   identity after takeover.
 */

const MARKER_PREFIX = 'zeus:hydrate:'
const TEXT_CLOSE_ID = '/'
const COMMENT_NODE = 8
const ELEMENT_NODE = 1
const SHOW_COMMENT = 0x80

export const HYDRATION_FALLBACK_ATTRIBUTE = 'data-zeus-hydration-fallback'

export interface AutomaticHydrationOptions {
  onHydrationError?: (error: Error) => void
}

export interface HydrationError extends Error {
  code: string
  markerId?: string
  componentId?: number
}

let createFrameDepth = 0
const sessionStack: AutoHydrationSession[] = []
const ownedContainers = new WeakSet<Element | DocumentFragment>()

function createHydrationError(
  code: string,
  message: string,
  scope: { markerId?: string; componentId?: number } = {},
): HydrationError {
  const error = new Error(`${code}: ${message}`) as HydrationError
  error.code = code
  if (scope.markerId !== undefined) error.markerId = scope.markerId
  if (scope.componentId !== undefined) error.componentId = scope.componentId
  return error
}

export function isHydrationError(error: unknown): error is HydrationError {
  return (
    error instanceof Error &&
    typeof (error as HydrationError).code === 'string' &&
    (error as HydrationError).code.startsWith('ZEUS_HYDRATION_')
  )
}

/** True when `node` or a descendant comment carries a hydration marker. */
export function hasHydrationMarkers(
  node: Element | DocumentFragment | null | undefined,
): boolean {
  if (!node) return false
  const document = node.ownerDocument
  if (!document) return false
  const walker = document.createTreeWalker(node, SHOW_COMMENT)
  let lightDomDepth = 0
  let current = walker.nextNode()
  while (current) {
    const data = (current as Comment).data
    if (data === LIGHT_DOM_ROOT_MARKER) {
      lightDomDepth++
    } else if (data === LIGHT_DOM_ROOT_END_MARKER && lightDomDepth > 0) {
      lightDomDepth--
    } else if (lightDomDepth === 0 && data.startsWith(MARKER_PREFIX)) {
      return true
    }
    current = walker.nextNode()
  }
  return false
}

function currentSession(): AutoHydrationSession | undefined {
  return sessionStack[sessionStack.length - 1]
}

/** Runs `run` with component adoption disabled: everything mounts fresh. */
export function withHydrationCreateFrame<T>(run: () => T): T {
  createFrameDepth++
  try {
    return run()
  } finally {
    createFrameDepth--
  }
}

/**
 * True while an adopted form control must keep the value the user set before
 * the client module registered. `bindProp` only consults it for the first
 * write of `value` / `checked` / `selected`.
 */
export function isHydrationFormWrite(el: Element, name: PropertyKey): boolean {
  const session = currentSession()
  return (
    session !== undefined &&
    session.active &&
    createFrameDepth === 0 &&
    session.adoptedElements.has(el) &&
    isNativeFormStateElement(el, String(name)) &&
    formStateDiffersFromMarkup(el, String(name))
  )
}

/**
 * Custom elements can expose `value` / `checked` / `selected` props without
 * being native form controls. Their first adopted write must not be skipped
 * just because the prop name matches a form-state property.
 */
export function isNativeFormStateElement(el: Element, name: string): boolean {
  const tag = el.localName
  if (name === 'value') {
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      tag === 'option'
    )
  }
  if (name === 'checked') return tag === 'input'
  if (name === 'selected') return tag === 'option'
  return false
}

/**
 * True when the live form state no longer matches the server markup, which is
 * the only case where the first binding write must be skipped.
 */
function formStateDiffersFromMarkup(el: Element, name: string): boolean {
  const record = el as Element & Record<string, unknown>
  switch (name) {
    case 'value': {
      const defaultValue = record.defaultValue
      if (typeof defaultValue === 'string') return record.value !== defaultValue
      const markup = el.getAttribute('value') ?? ''
      return record.value !== markup
    }
    case 'checked':
      return Boolean(record.checked) !== el.hasAttribute('checked')
    case 'selected':
      return Boolean(record.selected) !== el.hasAttribute('selected')
    default:
      return false
  }
}

export type HydrationElementShape = {
  readonly tag: string
  readonly staticAttributes?: readonly (readonly [string, string])[]
  readonly childTags?: readonly string[]
}

export type HydrationTextRegion = {
  readonly parent: Node
  readonly close: Comment
}

export type AutoHydrationHandle = {
  readonly componentId?: number
  /** Adopts the server element behind `markerId` and validates its shape. */
  element(markerId: string, shape: HydrationElementShape): Element
  /** Adopts the server text behind `markerId`, comparing the initial value. */
  text(markerId: string, expected?: unknown): Text
  /** Bounds a dynamic children-expression value on the server. */
  textRegion(markerId: string): HydrationTextRegion
  /** Clears a children-expression range and mounts the client value. */
  mountText(region: HydrationTextRegion, render: () => unknown): void
  /** Clears a control-flow region and returns its end anchor. */
  region(markerId: string): Comment
  /** Consumes an invocation marker and adopts the child component. */
  child(markerId: string, render: () => unknown): void
  /** Validates the server-rendered `<slot>` element of a shadow custom element. */
  slot(markerId: string): void
  /** Runs dynamic-region mounting with component adoption disabled. */
  mount(run: () => void): void
  /** A server boundary that cannot be adopted (for example ErrorBoundary). */
  unsupported(markerId: string): never
}

export interface AutoHydrationSessionOptions extends AutomaticHydrationOptions {
  readonly primary?: boolean
}

export interface HydrationRange {
  readonly open: Comment
  readonly close: Comment
}

/**
 * Opens one hydration session for `container`; throws
 * `ZEUS_HYDRATION_DUPLICATE_OWNER` when the container already has a live owner.
 */
export function beginHydrationSession(
  container: Element | DocumentFragment,
  options: AutoHydrationSessionOptions = {},
): AutoHydrationSession {
  if (ownedContainers.has(container)) {
    throw createHydrationError(
      'ZEUS_HYDRATION_DUPLICATE_OWNER',
      'the container already has a live hydration owner',
    )
  }
  ownedContainers.add(container)
  const session = new AutoHydrationSession(container, options)
  sessionStack.push(session)
  return session
}

/** Removes `session` from the active stack but keeps its container owned. */
export function suspendHydrationSession(session: AutoHydrationSession): void {
  const index = sessionStack.lastIndexOf(session)
  if (index >= 0) sessionStack.splice(index, 1)
}

/** Ends `session` and releases the container ownership. */
export function endHydrationSession(session: AutoHydrationSession): void {
  suspendHydrationSession(session)
  session.close()
}

export class AutoHydrationSession {
  readonly container: Element | DocumentFragment
  /** Elements adopted during this session; drives form-state preservation. */
  readonly adoptedElements = new WeakSet<Element>()
  readonly onHydrationError?: (error: Error) => void
  active = true
  adoptedComponents = 0
  readonly primary: boolean
  private readonly markers = new Map<string, Comment[]>()
  private readonly occurrences = new Map<string, number>()
  private readonly document: Document

  constructor(
    container: Element | DocumentFragment,
    options: AutoHydrationSessionOptions,
  ) {
    this.container = container
    this.document = container.ownerDocument as Document
    this.onHydrationError = options.onHydrationError
    this.primary = options.primary === true
    this.indexMarkers()
  }

  /** True once at least one compiled component adopted a server root. */
  get adopted(): boolean {
    return this.adoptedComponents > 0
  }

  close(): void {
    this.active = false
    ownedContainers.delete(this.container)
  }

  /**
   * Consumes the root marker of one component and pairs it with its server
   * end marker. Returns `null` when the server never rendered this component.
   */
  adoptComponentRoot(
    rootMarkerId: string,
    componentId: number,
  ): HydrationRange | null {
    const open = this.takeMarker(rootMarkerId, componentId, false)
    if (!open) return null
    const close = findCloseMarker(open, rootMarkerId)
    if (!close) {
      throw createHydrationError(
        'ZEUS_HYDRATION_REGION_UNTERMINATED',
        rootMarkerId,
        { markerId: rootMarkerId, componentId },
      )
    }
    this.adoptedElements.add(open.parentElement ?? (open.parentNode as never))
    this.adoptedComponents++
    return { open, close }
  }

  createHandle(componentId?: number): AutoHydrationHandle {
    return {
      componentId,
      element: (markerId, shape) =>
        this.adoptElement(markerId, shape, componentId),
      text: (markerId, expected) =>
        this.adoptText(markerId, expected, componentId),
      textRegion: markerId => this.openTextRegion(markerId, componentId),
      mountText: (region, render) => {
        this.clearTextRegion(region)
        withHydrationCreateFrame(() => {
          insertTracked(region.parent, render() as never, region.close)
        })
      },
      region: markerId => this.openRegion(markerId, componentId),
      child: (markerId, render) => {
        this.requireMarker(markerId, componentId)
        const value = render()
        if (hasRenderableOutput(value)) {
          throw createHydrationError(
            'ZEUS_HYDRATION_UNHYDRATED_COMPONENT',
            'a nested component created client nodes inside an adopted server tree',
            { markerId, componentId },
          )
        }
      },
      slot: markerId => this.adoptSlot(markerId, componentId),
      mount: run => {
        withHydrationCreateFrame(run)
      },
      unsupported: markerId => {
        throw createHydrationError(
          'ZEUS_HYDRATION_UNSUPPORTED',
          `the server boundary ${markerId} has no hydration contract`,
          { markerId, componentId },
        )
      },
    }
  }

  /**
   * Reports `error`, clears the failing component's server range, and returns
   * the end marker the fresh subtree must be inserted before.
   */
  fallback(range: HydrationRange, error: unknown): Comment {
    this.report(error)
    this.clearRange(range.open, range.close)
    return range.close
  }

  /** Reports a hydration diagnostic through the session's error channel. */
  report(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error))
    if (this.onHydrationError) {
      this.onHydrationError(normalized)
      return
    }
    if (typeof console !== 'undefined') {
      console.error(
        '[zeus] Automatic hydration fell back to a client render.',
        normalized,
      )
    }
  }

  private indexMarkers(): void {
    const walker = this.document.createTreeWalker(this.container, SHOW_COMMENT)
    let lightDomDepth = 0
    let current = walker.nextNode()
    while (current) {
      const data = (current as Comment).data
      if (data === LIGHT_DOM_ROOT_MARKER) {
        // Server Light DOM content belongs to that custom element's own
        // upgrade; the outer session must neither adopt nor diagnose it.
        lightDomDepth++
      } else if (data === LIGHT_DOM_ROOT_END_MARKER && lightDomDepth > 0) {
        lightDomDepth--
      } else if (lightDomDepth === 0 && data.startsWith(MARKER_PREFIX)) {
        const id = data.slice(MARKER_PREFIX.length)
        const entries = this.markers.get(id) ?? []
        entries.push(current as Comment)
        this.markers.set(id, entries)
      }
      current = walker.nextNode()
    }
  }

  /** Consumes the next occurrence of `markerId`; optional returns `null`. */
  private takeMarker(
    markerId: string,
    componentId: number | undefined,
    required = true,
  ): Comment | null {
    const entries = this.markers.get(markerId)
    const occurrence = this.occurrences.get(markerId) ?? 0
    this.occurrences.set(markerId, occurrence + 1)
    const marker = entries?.[occurrence]
    if (!marker || !this.container.contains(marker)) {
      if (!required) return null
      throw createHydrationError('ZEUS_HYDRATION_MARKER_MISSING', markerId, {
        markerId,
        componentId,
      })
    }
    return marker
  }

  private requireMarker(markerId: string, componentId?: number): Comment {
    return this.takeMarker(markerId, componentId) as Comment
  }

  private adoptElement(
    markerId: string,
    shape: HydrationElementShape,
    componentId?: number,
  ): Element {
    const marker = this.requireMarker(markerId, componentId)
    const target = nextHydratableNode(marker)
    if (!target) {
      throw createHydrationError('ZEUS_HYDRATION_TARGET_MISSING', markerId, {
        markerId,
        componentId,
      })
    }
    if (target.nodeType !== ELEMENT_NODE) {
      throw createHydrationError('ZEUS_HYDRATION_ELEMENT_TARGET', markerId, {
        markerId,
        componentId,
      })
    }
    const element = target as Element
    if (element.localName !== shape.tag) {
      throw createHydrationError(
        'ZEUS_HYDRATION_TAG_MISMATCH',
        `${markerId}; expected <${shape.tag}>, found <${element.localName}>`,
        { markerId, componentId },
      )
    }
    if (shape.staticAttributes) {
      for (const [name, value] of shape.staticAttributes) {
        if (element.getAttribute(name) !== value) {
          throw createHydrationError(
            'ZEUS_HYDRATION_ATTR_MISMATCH',
            `${markerId}; attribute "${name}"`,
            { markerId, componentId },
          )
        }
      }
    }
    if (shape.childTags && !hasServerLightDomBlock(element)) {
      const children = element.children
      const expected = shape.childTags
      const matches =
        children.length === expected.length &&
        expected.every((tag, index) => children[index].localName === tag)
      if (!matches) {
        throw createHydrationError(
          'ZEUS_HYDRATION_EXTRA_NODE',
          `${markerId}; expected [${expected.join(',')}], found [${Array.from(
            children,
          )
            .map(child => child.localName)
            .join(',')}]`,
          { markerId, componentId },
        )
      }
    }
    this.adoptedElements.add(element)
    return element
  }

  private adoptText(
    markerId: string,
    expected: unknown,
    componentId?: number,
  ): Text {
    const marker = this.requireMarker(markerId, componentId)
    const target = marker.nextSibling
    let text: Text
    if (target && target.nodeType === 3) {
      text = target as Text
    } else if (!target || target.nodeType === COMMENT_NODE) {
      // An empty server value leaves no text node behind; create one at the
      // marker position and keep every surrounding node's identity.
      text = this.document.createTextNode('')
      marker.parentNode?.insertBefore(text, target)
    } else {
      throw createHydrationError('ZEUS_HYDRATION_TEXT_TARGET', markerId, {
        markerId,
        componentId,
      })
    }
    if (expected !== undefined) {
      const value = stringifyHydrationText(expected)
      if (text.data !== value) {
        throw createHydrationError(
          'ZEUS_HYDRATION_TEXT_MISMATCH',
          `${markerId}; expected ${JSON.stringify(value)}, found ${JSON.stringify(text.data)}`,
          { markerId, componentId },
        )
      }
    }
    if (text.parentElement) this.adoptedElements.add(text.parentElement)
    return text
  }

  private openTextRegion(
    markerId: string,
    componentId?: number,
  ): HydrationTextRegion {
    const marker = this.requireMarker(markerId, componentId)
    const close = findCloseMarker(marker, TEXT_CLOSE_ID)
    if (!close) {
      throw createHydrationError(
        'ZEUS_HYDRATION_REGION_UNTERMINATED',
        markerId,
        { markerId, componentId },
      )
    }
    const parent = marker.parentNode
    if (!parent) {
      throw createHydrationError('ZEUS_HYDRATION_TARGET_MISSING', markerId, {
        markerId,
        componentId,
      })
    }
    return { parent, close }
  }

  private clearTextRegion(region: HydrationTextRegion): void {
    // The opening marker sits directly before the server value; the region
    // object only keeps the end anchor, so walk back from it.
    let node: Node | null = region.close.previousSibling
    while (node) {
      const previous: Node | null = node.previousSibling
      if (
        node.nodeType === COMMENT_NODE &&
        (node as Comment).data.startsWith(MARKER_PREFIX)
      ) {
        region.parent.removeChild(node)
        return
      }
      region.parent.removeChild(node)
      node = previous
    }
  }

  private adoptSlot(markerId: string, componentId?: number): void {
    const marker = this.requireMarker(markerId, componentId)
    const target = nextHydratableNode(marker)
    if (
      !target ||
      target.nodeType !== ELEMENT_NODE ||
      (target as Element).localName !== 'slot'
    ) {
      throw createHydrationError(
        'ZEUS_HYDRATION_TAG_MISMATCH',
        `${markerId}; expected <slot>`,
        { markerId, componentId },
      )
    }
    this.adoptedElements.add(target as Element)
  }

  private openRegion(markerId: string, componentId?: number): Comment {
    const marker = this.requireMarker(markerId, componentId)
    const close = findCloseMarker(marker, markerId)
    if (!close) {
      throw createHydrationError(
        'ZEUS_HYDRATION_REGION_UNTERMINATED',
        markerId,
        { markerId, componentId },
      )
    }
    this.clearRange(marker, close)
    // The end marker is the stable mount anchor; the opening marker has
    // served its purpose and must not split the rebuilt range.
    marker.parentNode?.removeChild(marker)
    close.parentNode &&
      this.adoptedElements.add(
        close.parentElement ?? (close.parentNode as never),
      )
    return close
  }

  private clearRange(open: Comment, close: Comment): void {
    let node: Node | null = open.nextSibling
    while (node && node !== close) {
      const next: Node | null = node.nextSibling
      node.parentNode?.removeChild(node)
      node = next
    }
  }
}

function hasRenderableOutput(value: unknown): boolean {
  if (value == null || value === false || value === true) return false
  if (Array.isArray(value)) return value.some(hasRenderableOutput)
  return true
}

function nextHydratableNode(marker: Comment): Node | null {
  let node = marker.nextSibling
  while (node && node.nodeType === COMMENT_NODE) node = node.nextSibling
  return node
}

function findCloseMarker(open: Comment, markerId: string): Comment | null {
  const expected = `${MARKER_PREFIX}/${markerId}`
  let node: Node | null = open.nextSibling
  while (node) {
    if (node.nodeType === COMMENT_NODE && (node as Comment).data === expected) {
      return node as Comment
    }
    node = node.nextSibling
  }
  return null
}

function hasServerLightDomBlock(element: Element): boolean {
  for (const child of Array.from(element.childNodes)) {
    if (
      child.nodeType === COMMENT_NODE &&
      (child as Comment).data === LIGHT_DOM_ROOT_MARKER
    ) {
      return true
    }
  }
  return false
}

function stringifyHydrationText(value: unknown): string {
  if (typeof value === 'function') {
    throw new TypeError(
      'JSX children require values; call the function explicitly.',
    )
  }
  if (Array.isArray(value)) return value.map(stringifyHydrationText).join('')
  if (value == null || value === false || value === true) return ''
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return value.textContent ?? ''
  }
  return String(value)
}

/** Marks the freshly rebuilt root elements of a fallback subtree. */
function markFallback(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) markFallback(item)
    return
  }
  if (typeof Node === 'undefined' || !(value instanceof Node)) return
  if (value.nodeType === ELEMENT_NODE) {
    ;(value as Element).setAttribute(HYDRATION_FALLBACK_ATTRIBUTE, '')
  } else if (value.nodeType === 11) {
    for (const child of Array.from((value as DocumentFragment).children)) {
      child.setAttribute(HYDRATION_FALLBACK_ATTRIBUTE, '')
    }
  }
}

/**
 * Reports a hydration failure and marks the root that fell back.
 *
 * Used by `render(..., { hydrate: true })` when the render produced client
 * nodes without adopting any server root.
 */
export function reportHydrationFailure(
  container: Element | DocumentFragment,
  error: unknown,
  onHydrationError?: (error: Error) => void,
): void {
  const normalized = error instanceof Error ? error : new Error(String(error))
  const target =
    container.nodeType === ELEMENT_NODE
      ? (container as Element)
      : container.nodeType === 11 && 'host' in container
        ? ((container as ShadowRoot).host as Element)
        : undefined
  if (target) target.setAttribute(HYDRATION_FALLBACK_ATTRIBUTE, '')
  if (onHydrationError) {
    onHydrationError(normalized)
    return
  }
  if (typeof console !== 'undefined') {
    console.error(
      '[zeus] Automatic hydration fell back to a client render.',
      normalized,
    )
  }
}

/**
 * Compiler entry for one component. `adopt` reuses the server tree; `create`
 * is the ordinary client body. A scoped hydration failure clears the
 * component's server range, marks the rebuilt root, and runs `create` fresh.
 */
export function autoHydrateComponent(
  componentId: number,
  rootMarkerId: string,
  adopt: (handle: AutoHydrationHandle) => unknown,
  create: () => unknown,
): unknown {
  const session = currentSession()
  if (!session || !session.active || createFrameDepth > 0) {
    return create()
  }
  const range = session.adoptComponentRoot(rootMarkerId, componentId)
  if (!range) return create()
  try {
    adopt(session.createHandle(componentId))
    return null
  } catch (error) {
    if (!isHydrationError(error)) throw error
    const close = session.fallback(range, error)
    return withHydrationCreateFrame(() => {
      const value = create()
      insertTracked(close.parentNode as Node, value as never, close)
      markFallback(value)
      return null
    })
  }
}

/** Compiler entry for an inline root: adopts only inside an active session. */
export function autoHydration(): AutoHydrationHandle | null {
  const session = currentSession()
  if (!session || !session.active || createFrameDepth > 0) return null
  return session.createHandle()
}
