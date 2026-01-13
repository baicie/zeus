// packages/runtime-dom/src/renderer/index.ts

// 纯 DOM 操作函数库

// 元素创建
export function createElement(tag: string): Element {
  return document.createElement(tag)
}

export function createTextNode(text: string): Text {
  return document.createTextNode(text)
}

export function createComment(text: string): Comment {
  return document.createComment(text)
}

export function createDocumentFragment(): DocumentFragment {
  return document.createDocumentFragment()
}

// 元素操作
export function insertBefore(
  parent: Node,
  child: Node,
  anchor?: Node | null,
): void {
  parent.insertBefore(child, anchor || null)
}

export function appendChild(parent: Node, child: Node): void {
  parent.appendChild(child)
}

export function removeChild(parent: Node, child: Node): void {
  parent.removeChild(child)
}

export function replaceChild(
  parent: Node,
  newChild: Node,
  oldChild: Node,
): void {
  parent.replaceChild(newChild, oldChild)
}

export function cloneNode(node: Node, deep: boolean = false): Node {
  return node.cloneNode(deep)
}

// 文本操作
export function setTextContent(el: Element, text: string): void {
  el.textContent = text
}

export function getTextContent(el: Element): string | null {
  return el.textContent
}

// 属性操作
export function setAttribute(el: Element, name: string, value: string): void {
  el.setAttribute(name, value)
}

export function getAttribute(el: Element, name: string): string | null {
  return el.getAttribute(name)
}

export function removeAttribute(el: Element, name: string): void {
  el.removeAttribute(name)
}

export function hasAttribute(el: Element, name: string): boolean {
  return el.hasAttribute(name)
}

// 样式操作
export function setStyle(
  el: HTMLElement,
  property: string,
  value: string,
): void {
  el.style.setProperty(property, value)
}

export function getStyle(el: HTMLElement, property: string): string {
  return el.style.getPropertyValue(property)
}

export function removeStyle(el: HTMLElement, property: string): void {
  el.style.removeProperty(property)
}

export function setCSS(el: HTMLElement, styles: Record<string, string>): void {
  Object.assign(el.style, styles)
}

// 类名操作
export function addClass(el: Element, className: string): void {
  el.classList.add(className)
}

export function removeClass(el: Element, className: string): void {
  el.classList.remove(className)
}

export function toggleClass(el: Element, className: string): void {
  el.classList.toggle(className)
}

export function hasClass(el: Element, className: string): boolean {
  return el.classList.contains(className)
}

export function setClass(el: Element, className: string): void {
  el.className = className
}

// 事件操作
export function addEventListener(
  el: Element | Window | Document,
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions,
): void {
  el.addEventListener(type, listener, options)
}

export function removeEventListener(
  el: Element | Window | Document,
  type: string,
  listener: EventListener,
  options?: boolean | EventListenerOptions,
): void {
  el.removeEventListener(type, listener, options)
}

// 元素查询
export function querySelector(selector: string): Element | null {
  return document.querySelector(selector)
}

export function querySelectorAll(selector: string): NodeListOf<Element> {
  return document.querySelectorAll(selector)
}

export function getElementById(id: string): HTMLElement | null {
  return document.getElementById(id)
}

export function getElementsByClassName(
  className: string,
): HTMLCollectionOf<Element> {
  return document.getElementsByClassName(className)
}

export function getElementsByTagName(
  tagName: string,
): HTMLCollectionOf<Element> {
  return document.getElementsByTagName(tagName)
}

// 虚拟 DOM 创建（纯函数）
export interface VNode {
  type: string
  props: Record<string, any> | null
  children: (VNode | string)[]
  key?: string | number
}

export function createVNode(
  type: string,
  props: Record<string, any> | null = null,
  ...children: (VNode | string)[]
): VNode {
  return {
    type,
    props: props || {},
    children,
  }
}

export function createTextVNode(text: string): VNode {
  return {
    type: 'text',
    props: null,
    children: [text],
  }
}

// 节点比较和更新（纯函数）
export function isSameVNode(n1: VNode, n2: VNode): boolean {
  return n1.type === n2.type && n1.key === n2.key
}

export function shouldUpdate(n1: VNode, n2: VNode): boolean {
  return (
    n1.type !== n2.type ||
    n1.key !== n2.key ||
    shallowCompare(n1.props, n2.props)
  )
}

function shallowCompare(
  obj1: Record<string, any> | null,
  obj2: Record<string, any> | null,
): boolean {
  if (obj1 === obj2) return false
  if (!obj1 || !obj2) return true

  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)

  if (keys1.length !== keys2.length) return true

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return true
  }

  return false
}
