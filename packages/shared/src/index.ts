export const VERSION = '0.0.1'

export const isArray: (arg: any) => arg is any[] = Array.isArray
export const isObject = (val: unknown): val is Record<any, any> =>
  val !== null && typeof val === 'object'
export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'

// DOM 相关工具函数
export const createElement = (tag: string): HTMLElement =>
  document.createElement(tag)
export const createTextNode = (text: string): Text =>
  document.createTextNode(text)
export const insert = (
  child: Node,
  parent: Node,
  anchor?: Node | null
): void => {
  parent.insertBefore(child, anchor || null)
}
