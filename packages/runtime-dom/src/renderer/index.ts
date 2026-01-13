// packages/runtime-dom/src/renderer/index.ts

// 最简化的 DOM 操作函数 / Simplified DOM operation functions

// 创建元素 / Create element
export function createElement(tag: string): Element {
  return document.createElement(tag)
}

// 添加子元素 / Append child element
export function appendChild(parent: Node, child: Node): void {
  parent.appendChild(child)
}

// 移除子元素 / Remove child element
export function removeChild(parent: Node, child: Node): void {
  parent.removeChild(child)
}

// 设置文本内容 / Set text content
export function setTextContent(el: Element, text: string): void {
  el.textContent = text
}

// 设置属性 / Set attribute
export function setAttribute(el: Element, name: string, value: string): void {
  el.setAttribute(name, value)
}

// 通过选择器查找元素 / Query element by selector
export function querySelector(selector: string): Element | null {
  return document.querySelector(selector)
}

// 纯 DOM 操作函数库 - 无虚拟 DOM
