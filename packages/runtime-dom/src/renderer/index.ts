import { extend } from '@zeus-js/shared'
import {
  type Component,
  type App as CoreApp,
  createApp as createCoreApp,
} from '@zeus-js/runtime-core'

export interface VNode {
  type: string | Component
  props: Record<string, any> | null
  children: (VNode | string)[]
  el?: Node
  key?: string | number
}

export interface RendererOptions {
  createElement: (tag: string) => Element
  createText: (text: string) => Text
  createComment: (text: string) => Comment
  insert: (child: Node, parent: Node, anchor?: Node | null) => void
  remove: (child: Node) => void
  setElementText: (el: Element, text: string) => void
  setText: (node: Text, text: string) => void
  patchProp: (el: Element, key: string, prevValue: any, nextValue: any) => void
}

export interface Renderer {
  render: (vnode: VNode | null, container: Element) => void
  createApp: (rootComponent: Component) => App
}

export function createRenderer(options: RendererOptions): Renderer {
  const {
    createElement,
    createText,
    createComment: _createComment,
    insert,
    remove,
    setElementText,
    setText: _setText,
    patchProp,
  } = options

  function patch(
    n1: VNode | null,
    n2: VNode | null,
    container: Element,
    anchor?: Node | null,
  ): void {
    if (n1 === n2) return

    if (n1 && !n2) {
      // 卸载
      unmount(n1)
      return
    }

    if (!n1 && n2) {
      // 挂载
      mount(n2, container, anchor)
      return
    }

    if (n1 && n2) {
      // 更新
      update(n1, n2, container, anchor)
    }
  }

  function mount(vnode: VNode, container: Element, anchor?: Node | null): void {
    const { type } = vnode

    if (typeof type === 'string') {
      // 原生元素
      const el = createElement(type)
      vnode.el = el

      // 处理props
      if (vnode.props) {
        for (const key in vnode.props) {
          patchProp(el, key, null, vnode.props[key])
        }
      }

      // 处理children
      if (vnode.children) {
        for (const child of vnode.children) {
          if (typeof child === 'string') {
            const textNode = createText(child)
            insert(textNode, el)
          } else {
            mount(child, el)
          }
        }
      }

      insert(el, container, anchor)
    } else if (typeof type === 'function' || typeof type === 'object') {
      // 组件
      // 这里简化处理，实际需要更复杂的组件渲染逻辑
      const el = createElement('div')
      vnode.el = el
      insert(el, container, anchor)
    }
  }

  function unmount(vnode: VNode): void {
    if (vnode.el) {
      remove(vnode.el)
    }
  }

  function update(
    n1: VNode,
    n2: VNode,
    container: Element,
    anchor?: Node | null,
  ): void {
    if (n1.type !== n2.type) {
      // 类型不同，替换整个节点
      unmount(n1)
      mount(n2, container, anchor)
      return
    }

    const el = (n2.el = n1.el!)

    // 更新props
    const oldProps = n1.props || {}
    const newProps = n2.props || {}

    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProp(el as Element, key, oldProps[key], newProps[key])
      }
    }

    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProp(el as Element, key, oldProps[key], null)
      }
    }

    // 更新children (简化版本)
    if (typeof n2.children === 'string') {
      setElementText(el as Element, n2.children)
    }
  }

  return {
    render(vnode: VNode | null, container: Element) {
      patch(null, vnode, container)
    },

    createApp(rootComponent: Component): App {
      const coreApp = createCoreApp(rootComponent)

      return extend(coreApp, {
        mount(container: Element | string) {
          return coreApp.mount(container)
        },
        unmount() {
          return coreApp.unmount()
        },
        component(name: string, component: Component) {
          return coreApp.component(name, component)
        },
      })
    },
  }
}

export interface App extends CoreApp {
  mount(container: Element | string): void
  unmount(): void
  component(name: string, component: Component): App
}

// 默认DOM渲染器选项
export const nodeOps: RendererOptions = {
  createElement: (tag: string) => document.createElement(tag),
  createText: (text: string) => document.createTextNode(text),
  createComment: (text: string) => document.createComment(text),
  insert: (child: Node, parent: Node, anchor?: Node | null) => {
    parent.insertBefore(child, anchor || null)
  },
  remove: (child: Node) => {
    if (child.parentNode) {
      child.parentNode.removeChild(child)
    }
  },
  setElementText: (el: Element, text: string) => {
    el.textContent = text
  },
  setText: (node: Text, text: string) => {
    node.nodeValue = text
  },
  patchProp: (el: Element, key: string, prevValue: any, nextValue: any) => {
    if (key.startsWith('on')) {
      // 事件处理
      const eventName = key.slice(2).toLowerCase()
      if (prevValue) {
        el.removeEventListener(eventName, prevValue)
      }
      if (nextValue) {
        el.addEventListener(eventName, nextValue)
      }
    } else if (key === 'class') {
      el.className = nextValue || ''
    } else if (key === 'style') {
      if (typeof nextValue === 'string') {
        el.setAttribute('style', nextValue)
      } else if (nextValue) {
        // Object.assign(el.style, nextValue)
      }
    } else if (typeof nextValue === 'boolean') {
      if (nextValue) {
        el.setAttribute(key, '')
      } else {
        el.removeAttribute(key)
      }
    } else {
      if (nextValue == null) {
        el.removeAttribute(key)
      } else {
        el.setAttribute(key, String(nextValue))
      }
    }
  },
}

// 默认DOM渲染器
export const renderer: Renderer = createRenderer(nodeOps)
