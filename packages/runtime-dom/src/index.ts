// packages/runtime-dom/src/index.ts

// 导出渲染器（DOM 操作函数）
export {
  createElement,
  createTextNode,
  createComment,
  createDocumentFragment,
  insertBefore,
  appendChild,
  removeChild,
  replaceChild,
  cloneNode,
  setTextContent,
  getTextContent,
  setAttribute,
  getAttribute,
  removeAttribute,
  hasAttribute,
  setStyle,
  getStyle,
  removeStyle,
  setCSS,
  addClass,
  removeClass,
  toggleClass,
  hasClass,
  setClass,
  createVNode,
  createTextVNode,
  isSameVNode,
  shouldUpdate,
} from './renderer'

// 导出指令系统
export * from './directives'

// 导出事件处理
export {
  addEventListener,
  removeEventListener,
  once,
  delegate,
  addEventListeners,
  debounceEvent,
  throttleEvent,
  stopPropagation,
  preventDefault,
  stop,
  createEvent,
  dispatchEvent,
} from './events'

// 导出 DOM 辅助函数
export * from './dom'
