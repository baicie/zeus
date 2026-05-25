import { effect } from '@zeus-js/signal'

export type JSXValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Node
  | JSXValue[]

export type Component<
  P extends Record<string, unknown> = Record<string, unknown>,
> = (props: P) => JSXValue

export type TemplateFactory<T extends Node = Node> = () => T

export type AttrValue = string | number | boolean | null | undefined

export function template<T extends Node = Node>(
  html: string,
  _isImportNode = false,
  _isSVG = false,
  _isMathML = false,
): TemplateFactory<T> {
  const t = document.createElement('template')
  t.innerHTML = html

  return function clone(): T {
    return t.content.cloneNode(true) as T
  }
}

export function insert(
  parent: Node,
  value: JSXValue,
  marker: Node | null = null,
): void {
  if (value === undefined) {
    if (__DEV__) {
      console.warn(
        '[Zeus runtime] insert received `undefined`, which is ignored. ' +
          'Use `null` or a fallback value explicitly if you want to suppress this warning.',
      )
    }
    return
  }

  if (value == null || value === false || value === true) return

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      insert(parent, value[i], marker)
    }
    return
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  parent.insertBefore(node, marker)
}

export function createComponent<
  P extends Record<string, unknown>,
  R extends JSXValue,
>(component: (props: P) => R, props: P): R {
  return component(props)
}

export function setAttr(el: Element, name: string, value: AttrValue): void {
  if (value == null || value === false) {
    el.removeAttribute(name)
    return
  }

  const attrName = name === 'className' ? 'class' : name

  if (value === true) {
    el.setAttribute(attrName, '')
    return
  }

  el.setAttribute(attrName, String(value))
}

export function marker(parent: ParentNode, index: number): Comment {
  let seen = 0
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_COMMENT)

  while (walker.nextNode()) {
    const node = walker.currentNode as Comment

    if (node.data === '' || node.data === '!') {
      if (seen === index) return node
      seen++
    }
  }

  throw new Error(`[Zeus runtime] marker ${index} not found`)
}

export function bindText(node: Text, value: () => JSXValue): void {
  effect(() => {
    const next = value()
    node.data =
      next == null || next === false || next === true ? '' : String(next)
  })
}

export function bindAttr(
  el: Element,
  name: string,
  value: () => AttrValue,
): void {
  effect(() => {
    setAttr(el, name, value())
  })
}

export function bindEvent<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  name: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void {
  el.addEventListener(name, handler)
}
