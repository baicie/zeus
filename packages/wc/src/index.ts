/**
 * @zeus-js/wc - 函数式 Web Components 库
 *
 * 提供基于函数式编程的 Web Components 解决方案
 * 支持 Hooks、响应式状态管理和原生 DOM 操作
 */

// 导出函数式 Web Components 核心功能
export {
  createFunctionalWC,
  defineFunctionalWC,
  hooks,
  type ComponentProps,
  type ComponentFunction,
  type FunctionalWCOptions,
  type ComponentContext,
} from './functional'

// 导出 Hooks（从 runtime 包重新导出）
export {
  useState,
  useComputed,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lifecycle,
  useAttributes,
  useEvents,
} from '@zeus-js/runtime'

// 导出 DOM 辅助函数
export {
  createElement,
  createText,
  el,
  div,
  button,
  input,
  span,
  p,
  h1,
  h2,
  h3,
  ul,
  li,
  type DOMElementOptions,
} from './dom-helper'

// 导出运行时依赖（重新导出）
export { createSignal, createEffect, createComputed } from '@zeus-js/runtime'

// 版本信息
export const version = '1.0.0'
