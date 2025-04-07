// packages/runtime-dom/src/nodeOps.ts

// DOM 节点操作的抽象接口
export const nodeOps = {
  // 创建元素
  createElement: (tag: string): Element => {
    return document.createElement(tag)
  },

  // 创建文本节点
  createText: (text: string): Text => {
    return document.createTextNode(text)
  },

  // 创建注释节点
  createComment: (text: string): Comment => {
    return document.createComment(text)
  },

  // 设置文本内容
  setText: (node: Node, text: string): void => {
    node.nodeValue = text
  },

  // 设置元素文本内容
  setElementText: (el: Element, text: string): void => {
    el.textContent = text
  },

  // 获取父节点
  parentNode: (node: Node): Node | null => {
    return node.parentNode
  },

  // 获取下一个兄弟节点
  nextSibling: (node: Node): Node | null => {
    return node.nextSibling
  },

  // 查询选择器
  querySelector: (selector: string): Element | null => {
    return document.querySelector(selector)
  },

  // 插入节点
  insert: (child: Node, parent: Node, anchor: Node | null = null): void => {
    parent.insertBefore(child, anchor)
  },

  // 移除节点
  remove: (child: Node): void => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  // 添加事件
  addEventListener: (
    el: Element,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void => {
    el.addEventListener(event, handler, options)
  },

  // 移除事件
  removeEventListener: (
    el: Element,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void => {
    el.removeEventListener(event, handler, options)
  },

  // 设置属性
  setAttribute: (el: Element, key: string, value: string): void => {
    el.setAttribute(key, value)
  },

  // 移除属性
  removeAttribute: (el: Element, key: string): void => {
    el.removeAttribute(key)
  },

  // 设置样式
  setStyle: (el: HTMLElement, key: string, value: string): void => {
    el.style[key as any] = value
  },

  // 设置样式属性
  setProperty: (el: any, key: string, value: any): void => {
    el[key] = value
  },

  // 处理SVG等命名空间
  createElementNS: (namespace: string, tag: string): Element => {
    return document.createElementNS(namespace, tag)
  },
}
