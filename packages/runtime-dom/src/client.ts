import { effect as _effect } from '@zeus-js/signal'

// =============================================================================
// template(html) — Creates a cached template element, returns a clone function
// =============================================================================
export function template(html: string): () => Node {
  let tpl: HTMLTemplateElement | undefined
  return () => {
    if (!tpl) {
      tpl = document.createElement('template')
      tpl.innerHTML = html
    }
    return tpl.content.firstChild!.cloneNode(true)
  }
}

// =============================================================================
// insert(parent, accessor, marker?) — Insert static or reactive content into DOM
// =============================================================================
export function insert(
  parent: Node,
  accessor: any,
  marker?: Node | null,
): void {
  if (typeof accessor === 'function') {
    let current: Node | Node[] | null = null
    _effect(() => {
      const value = accessor()
      current = insertValue(parent, value, current, marker ?? null)
    })
  } else {
    insertValue(parent, accessor, null, marker ?? null)
  }
}

function insertValue(
  parent: Node,
  value: any,
  current: Node | Node[] | null,
  marker: Node | null,
): Node | Node[] | null {
  if (current !== null) {
    if (Array.isArray(current)) {
      for (const node of current) {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
      }
    } else {
      if (current.parentNode) {
        current.parentNode.removeChild(current)
      }
    }
  }

  if (value == null || typeof value === 'boolean') {
    return null
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const textNode = document.createTextNode(String(value))
    parent.insertBefore(textNode, marker)
    return textNode
  }

  if (value instanceof Node) {
    parent.insertBefore(value, marker)
    return value
  }

  if (Array.isArray(value)) {
    const nodes: Node[] = []
    for (const item of value) {
      if (item instanceof Node) {
        parent.insertBefore(item, marker)
        nodes.push(item)
      } else if (item != null && typeof item !== 'boolean') {
        const tn = document.createTextNode(String(item))
        parent.insertBefore(tn, marker)
        nodes.push(tn)
      }
    }
    return nodes
  }

  return null
}

// =============================================================================
// delegateEvents(eventNames) — Set up event delegation on document
// =============================================================================
const delegatedEvents = new Set<string>()

export function delegateEvents(eventNames: string[]): void {
  for (const name of eventNames) {
    if (!delegatedEvents.has(name)) {
      delegatedEvents.add(name)
      document.addEventListener(name, eventHandler)
    }
  }
}

function eventHandler(e: Event): void {
  const key = `$$${e.type}`
  let node = e.target as any
  while (node !== null) {
    const handler = node[key]
    if (handler) {
      if (Array.isArray(handler)) {
        handler[0](handler[1], e)
      } else {
        handler(e)
      }
    }
    node = node.parentNode
  }
}

// =============================================================================
// DOM property/attribute helpers
// =============================================================================
export function addEventListener(
  node: Element,
  name: string,
  handler: EventListener,
  delegate?: boolean,
): void {
  if (delegate) {
    ;(node as any)[`$$${name}`] = handler
  } else {
    node.addEventListener(name, handler)
  }
}

export function setAttribute(node: Element, name: string, value: any): void {
  if (value == null || value === false) {
    node.removeAttribute(name)
  } else {
    node.setAttribute(name, value === true ? '' : String(value))
  }
}

export function setProperty(node: Element, name: string, value: any): void {
  ;(node as any)[name] = value
}

export function className(node: Element, value: string): void {
  node.className = value
}

export function style(
  node: HTMLElement,
  value: string | Record<string, string>,
): void {
  if (typeof value === 'string') {
    node.style.cssText = value
  } else {
    for (const [k, v] of Object.entries(value)) {
      node.style.setProperty(k, v)
    }
  }
}

export function spread(
  node: Element,
  accessor: Record<string, any> | (() => Record<string, any>),
): void {
  const applyProps = (props: Record<string, any>) => {
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class' || key === 'className') {
        className(node, value)
      } else if (key === 'style') {
        style(node as HTMLElement, value)
      } else if (key.startsWith('on')) {
        const eventName = key.slice(2).toLowerCase()
        addEventListener(node, eventName, value)
      } else if (key === 'ref') {
        if (typeof value === 'function') value(node)
      } else {
        setAttribute(node, key, value)
      }
    }
  }

  if (typeof accessor === 'function') {
    _effect(() => applyProps(accessor()))
  } else {
    applyProps(accessor)
  }
}

// =============================================================================
// createComponent(Comp, props) — Call a component function
// =============================================================================
export function createComponent<T>(Comp: (props: T) => any, props: T): any {
  return Comp(props)
}
