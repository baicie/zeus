import {
  createRuntimeDiagnosticsSession,
  type RuntimeDiagnosticsSession,
  type RuntimeDiagnosticsSnapshot,
} from '@zeus-js/signal/diagnostics'
import {
  hydrate as hydrateZeus,
  render as renderZeus,
  type HydrationContext,
  type JSXValue,
} from '@zeus-js/zeus'
import { renderToString as renderToStringZeus } from '@zeus-js/zeus/server'

const activeDisposers = new Set<() => void>()

export interface RenderResult {
  container: HTMLElement
  baseElement: HTMLElement
  dispose: () => void
  unmount: () => void
  rerender: (value: JSXValue | (() => JSXValue)) => void
}

export interface RenderTestOptions {
  container?: HTMLElement
}

/** Mount a Zeus view into an isolated test container. */
export function render(
  value: JSXValue | (() => JSXValue),
  options: RenderTestOptions = {},
): RenderResult {
  const document = getDocument()
  const container = options.container ?? document.createElement('div')
  const baseElement = container.ownerDocument?.body ?? container
  let dispose = renderZeus(value, container)

  const unmount = (): void => {
    dispose()
    activeDisposers.delete(unmount)
  }

  activeDisposers.add(unmount)

  return {
    container,
    baseElement,
    dispose: unmount,
    unmount,
    rerender(nextValue) {
      dispose()
      dispose = renderZeus(nextValue, container)
    },
  }
}

/** Dispose every render created by this test environment. */
export function cleanup(): void {
  for (const dispose of Array.from(activeDisposers)) dispose()
}

function getDocument(): Document {
  if (typeof globalThis.document === 'undefined') {
    throw new Error(
      '@zeus-js/testing requires a DOM environment. Configure JSDOM or a browser test environment before rendering.',
    )
  }
  return globalThis.document
}

export type FireEventInit = EventInit & Record<string, unknown>

export function fireEvent(element: Element, event: Event): boolean
export function fireEvent(
  element: Element,
  type: string,
  init?: FireEventInit,
): boolean
export function fireEvent(
  element: Element,
  eventOrType: Event | string,
  init: FireEventInit = {},
): boolean {
  const event =
    typeof eventOrType === 'string'
      ? createEvent(element.ownerDocument, eventOrType, init)
      : eventOrType

  return element.dispatchEvent(event)
}

export namespace fireEvent {
  export function click(element: Element, init?: FireEventInit): boolean {
    return fireEvent(element, 'click', init)
  }

  export function input(element: Element, init?: FireEventInit): boolean {
    return fireEvent(element, 'input', init)
  }

  export function change(element: Element, init?: FireEventInit): boolean {
    return fireEvent(element, 'change', init)
  }

  export function submit(element: Element, init?: FireEventInit): boolean {
    return fireEvent(element, 'submit', init)
  }

  export function focus(element: Element, init?: FireEventInit): boolean {
    return fireEvent(element, 'focus', init)
  }

  export function blur(element: Element, init?: FireEventInit): boolean {
    return fireEvent(element, 'blur', init)
  }
}

function createEvent(
  document: Document,
  type: string,
  init: FireEventInit,
): Event {
  const EventConstructor = eventConstructor(
    type,
    document.defaultView as (Window & typeof globalThis) | null,
  )
  const { bubbles = true, cancelable = true, composed = true, ...extra } = init
  const event = new EventConstructor(type, { bubbles, cancelable, composed })

  for (const [key, value] of Object.entries(extra)) {
    try {
      Object.defineProperty(event, key, {
        configurable: true,
        enumerable: true,
        value,
      })
    } catch {
      // Read-only browser fields are intentionally left unchanged.
    }
  }

  return event
}

function eventConstructor(
  type: string,
  window: (Window & typeof globalThis) | null,
): EventConstructor {
  if (!window) return globalThis.Event
  if (
    /^(click|dblclick|mousedown|mouseup|mousemove|mouseover|mouseout)$/.test(
      type,
    )
  ) {
    return window.MouseEvent as unknown as EventConstructor
  }
  if (/^(input|change|beforeinput)$/.test(type)) {
    return window.InputEvent as unknown as EventConstructor
  }
  if (/^(submit|reset)$/.test(type)) return window.Event
  if (/^(focus|blur|focusin|focusout)$/.test(type)) {
    return window.FocusEvent as unknown as EventConstructor
  }
  if (type.startsWith('key')) {
    return window.KeyboardEvent as unknown as EventConstructor
  }
  return window.Event
}

type EventConstructor = new (type: string, init?: EventInit) => Event

/** Let queued microtasks and framework effects settle before assertions. */
export async function flushEffects(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

export interface WaitForOptions {
  timeout?: number
  interval?: number
}

/** Retry an assertion until it succeeds or the timeout expires. */
export async function waitFor<T>(
  callback: () => T,
  options: WaitForOptions = {},
): Promise<T> {
  const timeout = options.timeout ?? 1000
  const interval = options.interval ?? 10
  const deadline = Date.now() + timeout
  let lastError: unknown

  while (Date.now() <= deadline) {
    try {
      return callback()
    } catch (error) {
      lastError = error
    }
    await flushEffects()
    await new Promise<void>(resolve => setTimeout(resolve, interval))
  }

  throw lastError ?? new Error('waitFor() timed out')
}

export function waitForElement(
  container: ParentNode,
  selector: string,
  options?: WaitForOptions,
): Promise<Element> {
  return waitFor(() => {
    const element = container.querySelector(selector)
    if (!element) throw new Error(`Element not found: ${selector}`)
    return element
  }, options)
}

export interface UserTypeOptions {
  delay?: number
  skipClick?: boolean
}

export interface UserCompositionOptions {
  updates?: readonly string[]
  end?: string
}

/** Small, DOM-native interaction helpers for component tests. */
export const userEvent = {
  async click(element: HTMLElement): Promise<void> {
    element.focus?.()
    fireEvent.click(element)
    await flushEffects()
  },

  async clear(element: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
    element.focus()
    setControlValue(element, '')
    fireEvent.input(element, { inputType: 'deleteContentBackward', data: null })
    await flushEffects()
  },

  async type(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string,
    options: UserTypeOptions = {},
  ): Promise<void> {
    if (!options.skipClick) await userEvent.click(element)
    const delay = options.delay ?? 0
    for (const character of text) {
      fireEvent(element, 'keydown', {
        key: character,
        code: keyCode(character),
      })
      fireEvent(element, 'beforeinput', {
        data: character,
        inputType: 'insertText',
      })
      setControlValue(element, `${element.value}${character}`)
      fireEvent.input(element, { data: character, inputType: 'insertText' })
      fireEvent(element, 'keyup', { key: character, code: keyCode(character) })
      if (delay > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, delay))
      }
    }
    await flushEffects()
  },

  async keyboard(text: string): Promise<void> {
    const target = document.activeElement
    if (!(target instanceof HTMLElement)) return
    for (const key of text) {
      fireEvent(target, 'keydown', { key, code: keyCode(key) })
      fireEvent(target, 'keyup', { key, code: keyCode(key) })
    }
    await flushEffects()
  },

  async composition(
    element: HTMLInputElement | HTMLTextAreaElement,
    options: UserCompositionOptions = {},
  ): Promise<void> {
    const updates = options.updates ?? []
    const finalValue = options.end ?? updates[updates.length - 1] ?? ''
    fireEvent(element, 'compositionstart', { data: '' })
    for (const update of updates) {
      setControlValue(element, update)
      fireEvent(element, 'compositionupdate', { data: update })
      fireEvent.input(element, {
        data: update,
        inputType: 'insertCompositionText',
        isComposing: true,
      })
    }
    setControlValue(element, finalValue)
    fireEvent(element, 'compositionend', { data: finalValue })
    fireEvent.input(element, {
      data: finalValue,
      inputType: 'insertText',
      isComposing: false,
    })
    await flushEffects()
  },
}

function setControlValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype = Object.getPrototypeOf(element) as object
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(element, value)
}

function keyCode(key: string): string {
  if (key.length === 1) return `Key${key.toUpperCase()}`
  return key
}

export interface LeakCheck extends RuntimeDiagnosticsSession {
  assertNoLeaks(): Readonly<RuntimeDiagnosticsSnapshot>
}

/** Collect runtime resources and fail if render disposal leaves any alive. */
export function startLeakCheck(): LeakCheck {
  const diagnostics = createRuntimeDiagnosticsSession()
  return {
    run: diagnostics.run,
    snapshot: diagnostics.snapshot,
    dispose: diagnostics.dispose,
    assertNoLeaks(): Readonly<RuntimeDiagnosticsSnapshot> {
      const snapshot = diagnostics.snapshot()
      const leaks = {
        effects: snapshot.effectsCreated - snapshot.effectsDisposed,
        scopes: snapshot.scopesCreated - snapshot.scopesDisposed,
        owners: snapshot.ownersCreated - snapshot.ownersDisposed,
        bindings: snapshot.bindingsCreated - snapshot.bindingsDisposed,
        listeners: snapshot.listenersCreated - snapshot.listenersDisposed,
      }
      const active = Object.entries(leaks).filter(([, count]) => count > 0)
      if (active.length > 0) {
        throw new Error(
          `Zeus runtime leak: ${active.map(([name, count]) => `${name}=${count}`).join(', ')}`,
        )
      }
      return snapshot
    },
  }
}

export interface HydratedResult {
  container: HTMLElement
  dispose: () => void
  unmount: () => void
}

/** Server helper kept separate from the DOM render helper for SSR regressions. */
export function renderSSR(
  input: Parameters<typeof renderToStringZeus>[0],
): string {
  return renderToStringZeus(input)
}

export function hydrateSSR(
  html: string,
  setup: (context: HydrationContext) => void,
  options: { container?: HTMLElement } = {},
): HydratedResult {
  const document = getDocument()
  const container = options.container ?? document.createElement('div')
  container.innerHTML = html
  const dispose = hydrateZeus(container, setup)
  return { container, dispose, unmount: dispose }
}

export interface RoleQueryOptions {
  name?: string | RegExp
}

/** Find the first element with an explicit or implicit ARIA role. */
export function queryByRole(
  container: ParentNode,
  role: string,
  options: RoleQueryOptions = {},
): HTMLElement | null {
  const candidates: HTMLElement[] = [
    ...(isElement(container) && hasRole(container, role)
      ? [container as HTMLElement]
      : []),
    ...Array.from(container.querySelectorAll<HTMLElement>('*')).filter(
      element => hasRole(element, role),
    ),
  ]

  return (
    candidates.find(element => {
      const name = accessibleName(element)
      return options.name === undefined
        ? true
        : typeof options.name === 'string'
          ? name === options.name
          : options.name.test(name)
    }) ?? null
  )
}

function isElement(value: ParentNode): value is Element {
  return (
    'getAttribute' in value &&
    typeof (value as Element).getAttribute === 'function'
  )
}

function hasRole(element: Element, requestedRole: string): boolean {
  const explicitRole = element.getAttribute('role')
  if (explicitRole) return explicitRole.split(/\s+/).includes(requestedRole)

  const tag = element.tagName.toLowerCase()
  if (requestedRole === 'button') return tag === 'button'
  if (requestedRole === 'link')
    return tag === 'a' && element.hasAttribute('href')
  if (requestedRole === 'heading') return /^h[1-6]$/.test(tag)
  if (requestedRole === 'checkbox') {
    return tag === 'input' && element.getAttribute('type') === 'checkbox'
  }
  if (requestedRole === 'radio') {
    return tag === 'input' && element.getAttribute('type') === 'radio'
  }
  if (requestedRole === 'textbox') {
    return (
      tag === 'textarea' ||
      (tag === 'input' &&
        ![
          'button',
          'checkbox',
          'hidden',
          'image',
          'radio',
          'range',
          'reset',
          'submit',
        ].includes(element.getAttribute('type') ?? 'text'))
    )
  }
  if (requestedRole === 'img')
    return tag === 'img' && element.hasAttribute('alt')
  if (requestedRole === 'list') return tag === 'ul' || tag === 'ol'
  if (requestedRole === 'listitem') return tag === 'li'
  if (requestedRole === 'option') return tag === 'option'
  return false
}

function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const document = element.ownerDocument
    return labelledBy
      .split(/\s+/)
      .map(id => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
  }

  return (
    element.getAttribute('aria-label') ??
    element.getAttribute('alt') ??
    element.getAttribute('title') ??
    element.textContent ??
    ''
  ).trim()
}
