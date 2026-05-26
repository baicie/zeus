import './types'

export type {
  JSXValue,
  JSXGetter,
  Component,
  TemplateFactory,
  AttrValue,
  ClassValue,
  StyleValue,
  RefTarget,
} from './types'

export { template } from './template'

export { render } from './render'

export { insert, mountDynamic } from './insert'

export { marker, child, removeNodes } from './dom'

export {
  bindText,
  bindAttr,
  bindProp,
  bindClass,
  bindStyle,
  setAttr,
  normalizeClass,
} from './bindings'

export { bindEvent, delegateEvents } from './events'

export { setRef, bindRef } from './refs'

export { createComponent } from './component'

export {
  Show,
  For,
  mountShow,
  mountFor,
  resolveValue,
  type ShowProps,
  type ForProps,
} from './controlFlow'

export {
  defineElement,
  type DefineElementOptions,
  type ElementPropConstructor,
} from './defineElement'
