import { render as renderZeus, type JSXValue } from '@zeus-js/zeus'

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
  }

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
