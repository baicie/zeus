// packages/runtime-dom/src/index.ts

// 导出最简化的 DOM 操作函数
export {
  createElement,
  appendChild,
  removeChild,
  setTextContent,
  setAttribute,
  querySelector,
} from './renderer'

// 导出简化的指令系统
export { applyDirective, updateDirective, vShow, vText } from './directives'

// 导出简化的事件处理
export { addEventListener, removeEventListener } from './events'
