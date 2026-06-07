const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined'

type AttributeValue = string | number | boolean | null | undefined
type DelegatedEventTarget = Node & {
  [key: `$$${string}`]: EventListener | undefined
  parentNode: Node | null
}

const delegatedEventsByDocument = new WeakMap<Document, Set<string>>()

export function createElement(tag: string): HTMLElement {
  assertBrowser()

  return document.createElement(tag)
}

export function createText(text: string): Text {
  assertBrowser()

  return document.createTextNode(text)
}

export function insert(parent: Node, node: Node, anchor?: Node | null): void {
  parent.insertBefore(node, anchor ?? null)
}

export function remove(node: Node): void {
  node.parentNode?.removeChild(node)
}

export function setText(node: Text, text: string): void {
  node.data = text
}

export function setAttribute(
  node: HTMLElement,
  name: string,
  value: AttributeValue,
): void {
  if (value == null || value === false) {
    node.removeAttribute(name)
    return
  }

  node.setAttribute(name, value === true ? '' : String(value))
}

export function removeAttribute(node: HTMLElement, name: string): void {
  node.removeAttribute(name)
}

export function setClass(node: HTMLElement, className: string): void {
  if (className) {
    node.className = className
    return
  }

  node.removeAttribute('class')
}

export function setStyle(
  node: HTMLElement,
  style: Partial<CSSStyleDeclaration>,
): void {
  Object.assign(node.style, style)
}

export function delegateEvents(
  eventNames: readonly string[],
  ownerDocument: Document = window.document,
): void {
  const delegatedEvents =
    delegatedEventsByDocument.get(ownerDocument) ?? new Set<string>()

  if (!delegatedEventsByDocument.has(ownerDocument)) {
    delegatedEventsByDocument.set(ownerDocument, delegatedEvents)
  }

  for (const name of eventNames) {
    if (delegatedEvents.has(name)) continue

    delegatedEvents.add(name)
    ownerDocument.addEventListener(name, dispatchDelegatedEvent)
  }
}

function dispatchDelegatedEvent(event: Event): void {
  const eventRoot = event.currentTarget
  let node = event.target as DelegatedEventTarget | null
  const key = `$$${event.type}` as const

  while (node && node !== eventRoot) {
    const handler = node[key]

    if (handler) {
      handler.call(node, event)

      if (event.cancelBubble) {
        return
      }
    }

    node = node.parentNode as DelegatedEventTarget | null
  }
}

function assertBrowser(): void {
  if (!isBrowser) {
    throw new Error('DOM operations are only available in browser environment')
  }
}
