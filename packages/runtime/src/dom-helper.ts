/**
 * DOM 操作工具集
 * 提供最基础的 DOM 创建、操作和挂载功能
 */

// 基础类型定义
export type DOMNode = Element | Text | DocumentFragment
export type DOMElement = Element
export type DOMText = Text

// 属性类型
export type Attrs = Record<string, string | number | boolean | null | undefined>

// 事件处理器类型
export type EventHandler = (event: Event) => void

/**
 * 创建元素节点
 * @param tag 标签名
 * @param attrs 属性对象
 * @param children 子节点
 * @returns 创建的元素
 */
export function createElement(
  tag: string,
  attrs?: Attrs,
  ...children: (DOMNode | string | number)[]
): DOMElement {
  const element = document.createElement(tag)

  // 设置属性
  if (attrs) {
    setAttrs(element, attrs)
  }

  // 添加子节点
  if (children.length > 0) {
    children.forEach(child => {
      if (child != null) {
        element.appendChild(createNode(child))
      }
    })
  }

  return element
}

/**
 * 创建文本节点
 * @param text 文本内容
 * @returns 文本节点
 */
export function createText(text: string | number): DOMText {
  return document.createTextNode(String(text))
}

/**
 * 创建文档片段
 * @param children 子节点
 * @returns 文档片段
 */
export function createFragment(
  ...children: (DOMNode | string | number)[]
): DocumentFragment {
  const fragment = document.createDocumentFragment()

  children.forEach(child => {
    if (child != null) {
      fragment.appendChild(createNode(child))
    }
  })

  return fragment
}

/**
 * 通用节点创建函数
 * @param node 节点内容
 * @returns DOM 节点
 */
export function createNode(node: DOMNode | string | number): DOMNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return createText(node)
  }
  return node
}

/**
 * 设置元素属性
 * @param element 目标元素
 * @param attrs 属性对象
 */
export function setAttrs(element: DOMElement, attrs: Attrs): void {
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      element.removeAttribute(key)
    } else if (typeof value === 'boolean') {
      if (value) {
        element.setAttribute(key, '')
      } else {
        element.removeAttribute(key)
      }
    } else {
      element.setAttribute(key, String(value))
    }
  })
}

/**
 * 设置单个属性
 * @param element 目标元素
 * @param name 属性名
 * @param value 属性值
 */
export function setAttr(
  element: DOMElement,
  name: string,
  value: string | number | boolean | null | undefined,
): void {
  if (value === null || value === undefined) {
    element.removeAttribute(name)
  } else if (typeof value === 'boolean') {
    if (value) {
      element.setAttribute(name, '')
    } else {
      element.removeAttribute(name)
    }
  } else {
    element.setAttribute(name, String(value))
  }
}

/**
 * 获取属性值
 * @param element 目标元素
 * @param name 属性名
 * @returns 属性值
 */
export function getAttr(element: DOMElement, name: string): string | null {
  return element.getAttribute(name)
}

/**
 * 移除属性
 * @param element 目标元素
 * @param name 属性名
 */
export function removeAttr(element: DOMElement, name: string): void {
  element.removeAttribute(name)
}

/**
 * 检查是否有属性
 * @param element 目标元素
 * @param name 属性名
 * @returns 是否有该属性
 */
export function hasAttr(element: DOMElement, name: string): boolean {
  return element.hasAttribute(name)
}

/**
 * 设置文本内容
 * @param element 目标元素
 * @param text 文本内容
 */
export function setText(element: DOMElement, text: string | number): void {
  element.textContent = String(text)
}

/**
 * 插入文本到指定位置
 * @param element 目标元素
 * @param text 文本内容
 * @param index 插入位置
 */
export function insertText(
  element: DOMElement,
  text: string | number,
  index?: number,
): void {
  const textNode = createText(text)
  const children = element.childNodes

  if (index === undefined || index >= children.length) {
    element.appendChild(textNode)
  } else {
    element.insertBefore(textNode, children[index])
  }
}

/**
 * 挂载节点到容器
 * @param container 容器元素
 * @param node 要挂载的节点
 */
export function mount(container: DOMElement | ShadowRoot, node: DOMNode): void {
  container.appendChild(node)
}

/**
 * 卸载节点
 * @param node 要卸载的节点
 */
export function unmount(node: DOMNode): void {
  if (node.parentNode) {
    node.parentNode.removeChild(node)
  }
}

/**
 * 清空容器
 * @param container 容器元素
 */
export function clear(container: DOMElement | ShadowRoot): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild)
  }
}

/**
 * 替换节点
 * @param oldNode 旧节点
 * @param newNode 新节点
 */
export function replace(oldNode: DOMNode, newNode: DOMNode): void {
  if (oldNode.parentNode) {
    oldNode.parentNode.replaceChild(newNode, oldNode)
  }
}

/**
 * 在指定节点前插入
 * @param referenceNode 参考节点
 * @param newNode 新节点
 */
export function insertBefore(referenceNode: DOMNode, newNode: DOMNode): void {
  if (referenceNode.parentNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode)
  }
}

/**
 * 在指定节点后插入
 * @param referenceNode 参考节点
 * @param newNode 新节点
 */
export function insertAfter(referenceNode: DOMNode, newNode: DOMNode): void {
  if (referenceNode.parentNode) {
    const nextSibling = referenceNode.nextSibling
    if (nextSibling) {
      referenceNode.parentNode.insertBefore(newNode, nextSibling)
    } else {
      referenceNode.parentNode.appendChild(newNode)
    }
  }
}

/**
 * 添加事件监听器
 * @param element 目标元素
 * @param event 事件名
 * @param handler 事件处理器
 * @param options 事件选项
 */
export function addEventListener(
  element: DOMElement,
  event: string,
  handler: EventHandler,
  options?: boolean | AddEventListenerOptions,
): void {
  element.addEventListener(event, handler, options)
}

/**
 * 移除事件监听器
 * @param element 目标元素
 * @param event 事件名
 * @param handler 事件处理器
 * @param options 事件选项
 */
export function removeEventListener(
  element: DOMElement,
  event: string,
  handler: EventHandler,
  options?: boolean | AddEventListenerOptions,
): void {
  element.removeEventListener(event, handler, options)
}

/**
 * 事件委托
 * @param container 容器元素
 * @param selector 选择器
 * @param event 事件名
 * @param handler 事件处理器
 * @param options 事件选项
 */
export function delegateEvent(
  container: DOMElement,
  selector: string,
  event: string,
  handler: EventHandler,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const delegatedHandler = (e: Event) => {
    const target = e.target as Element
    if (target && target.matches(selector)) {
      handler(e)
    }
  }

  container.addEventListener(event, delegatedHandler, options)

  // 返回清理函数
  return () => {
    container.removeEventListener(event, delegatedHandler, options)
  }
}
