import {
  effect,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  stop,
} from '@zeus-js/signal'

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

export type ShowProps = {
  when: unknown
  fallback?: JSXValue | (() => JSXValue)
  children?: JSXValue | (() => JSXValue)
}

export function Show(props: ShowProps): JSXValue {
  return props.when
    ? resolveValue(props.children)
    : resolveValue(props.fallback)
}

export type ForProps<T> = {
  each: readonly T[] | null | undefined
  children: (item: T, index: number) => JSXValue
}

export function For<T>(props: ForProps<T>): JSXValue {
  return props.each?.map((item, index) => props.children(item, index)) ?? null
}

export function mountShow(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  fallback?: () => JSXValue,
): void {
  mountDynamic(parent, marker, () =>
    when() ? children() : fallback ? fallback() : null,
  )
}

export function mountFor<T>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  mountDynamic(
    parent,
    marker,
    () => each()?.map((item, index) => render(item, index)) ?? null,
  )
}

export function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
): () => void {
  const scope = effectScope()

  scope.run(() => {
    insert(container, resolveValue(value))
  })

  return () => {
    scope.stop()
    container.textContent = ''
  }
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

  for (const node of parent.childNodes) {
    if (node.nodeType !== Node.COMMENT_NODE) continue

    const comment = node as Comment

    if (comment.data !== '' && comment.data !== '!') continue
    if (seen === index) return comment

    seen++
  }

  throw new Error(`[Zeus runtime] marker ${index} not found`)
}

export function child(parent: ParentNode, index: number): ChildNode {
  const node = parent.childNodes.item(index)

  if (!node) {
    throw new Error(`[Zeus runtime] child ${index} not found`)
  }

  return node as ChildNode
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

export function bindProp<T extends Element>(
  el: T,
  name: keyof T,
  value: () => T[keyof T],
): void {
  effect(() => {
    el[name] = value()
  })
}

export function bindEvent<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  name: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void {
  el.addEventListener(name, handler)
}

export type RefTarget<T> =
  | ((value: T | null) => void)
  | { value: T | null }
  | { current: T | null }

export function setRef<T>(
  target: RefTarget<T> | null | undefined,
  value: T | null,
): void {
  if (target == null) return

  if (typeof target === 'function') {
    target(value)
    return
  }

  if ('value' in target) {
    target.value = value
    return
  }

  if ('current' in target) {
    target.current = value
    return
  }

  if (__DEV__) {
    console.warn('[Zeus runtime] Invalid ref target:', target)
  }
}

export function bindRef<T extends Element>(
  el: T,
  target: RefTarget<T> | null | undefined,
): void {
  setRef(target, el)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      setRef(target, null)
    }, true)
  }
}

export type ElementPropConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor

export type DefineElementOptions<P extends Record<string, unknown>> = {
  shadow?: boolean | ShadowRootInit
  props?: Partial<Record<keyof P, ElementPropConstructor>>
}

export function defineElement<P extends Record<string, unknown>>(
  tagName: string,
  options: DefineElementOptions<P>,
  setup: (props: P) => JSXValue,
): CustomElementConstructor {
  const propSchema = options.props ?? {}
  const attrToProp = new Map<string, string>()

  for (const key of Object.keys(propSchema)) {
    attrToProp.set(toKebabCase(key), key)
  }

  class ZeusElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return Array.from(attrToProp.keys())
    }

    private dispose?: () => void
    private props = {} as P

    connectedCallback(): void {
      if (this.dispose) return

      for (const [attr, prop] of attrToProp) {
        this.writePropFromAttribute(prop, this.getAttribute(attr))
      }

      const target =
        options.shadow === false || options.shadow == null
          ? this
          : this.attachShadow(
              typeof options.shadow === 'object'
                ? options.shadow
                : { mode: 'open' },
            )

      this.dispose = render(() => setup(this.props), target)
    }

    disconnectedCallback(): void {
      this.dispose?.()
      this.dispose = undefined
    }

    attributeChangedCallback(
      name: string,
      _oldValue: string | null,
      newValue: string | null,
    ): void {
      const prop = attrToProp.get(name)
      if (prop) this.writePropFromAttribute(prop, newValue)
    }

    private writePropFromAttribute(prop: string, value: string | null): void {
      const type = (
        propSchema as Record<string, ElementPropConstructor | undefined>
      )[prop]

      ;(this.props as Record<string, unknown>)[prop] = castAttributeValue(
        value,
        type,
      )
    }
  }

  if (!customElements.get(tagName)) {
    customElements.define(tagName, ZeusElement)
  }

  return ZeusElement
}

function resolveValue(value: JSXValue | (() => JSXValue)): JSXValue {
  return typeof value === 'function' ? value() : value
}

function mountDynamic(parent: Node, marker: Node, value: () => JSXValue): void {
  let current: Node[] = []

  const runner = effect(() => {
    removeNodes(current)
    current = insertTracked(parent, value(), marker)
  })

  onScopeDispose(() => {
    stop(runner)
    removeNodes(current)
    current = []
  }, true)
}

function insertTracked(
  parent: Node,
  value: JSXValue,
  marker: Node | null,
): Node[] {
  if (
    value === undefined ||
    value == null ||
    value === false ||
    value === true
  ) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => insertTracked(parent, item, marker))
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  parent.insertBefore(node, marker)

  return [node]
}

function removeNodes(nodes: Node[]): void {
  for (const node of nodes) {
    node.parentNode?.removeChild(node)
  }
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function castAttributeValue(
  value: string | null,
  type: ElementPropConstructor | undefined,
): unknown {
  if (type === Boolean) return value !== null
  if (type === Number) return value == null ? undefined : Number(value)
  return value
}
