// 导出核心API
export * from '@zeus-js/runtime-core'

// DOM特定组件
export { For } from './components/For'
export { Show } from './components/Show'
export { Portal } from './components/Portal'
// export { Dynamic } from './components/Dynamic'
// export { ErrorBoundary } from './components/ErrorBoundary'
// export { Suspense, SuspenseList } from './components/Suspense'

// JSX运行时
export { jsx, jsxs, Fragment } from './jsx-runtime'

// DOM渲染API
export { render, hydrate } from './render'

// DOM原语 (供编译器使用)
export {
  createElement as _$createElement,
  setProperty as _$setProperty,
  setClassList as _$setClassList,
  setStyle as _$setStyle,
  setAttribute as _$setAttribute,
  addEventListener as _$addEventListener,
  removeEventListener as _$removeEventListener,
  insertExpression as _$insertExpression,
  insert as _$insert,
  spread as _$spread,
} from './primitives/elements'

// 委托事件
export { delegateEvents } from './primitives/events'
export * from './jsx'
