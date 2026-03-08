// packages/web-components/src/adapter.ts

import type { ComponentFunction } from '@zeus-js/runtime-core'
import type { Store } from '@zeus-js/store'
import type { defineStore } from '@zeus-js/store'
import { render } from '@zeus-js/runtime-core'
import { extend } from '@zeus-js/shared'
import { registerComponent } from './registry'

// ============================================
// Prop 类型定义
// ============================================

export type PropType<T = any> =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ObjectConstructor
  | ArrayConstructor
  | FunctionConstructor

export interface WebComponentPropOptions<T = any> {
  // 属性类型
  type?: PropType<T>
  // 默认值
  default?: T | (() => T)
  // 是否必需
  required?: boolean
  // 属性名（用于转换）
  attribute?: string
}

// 简写形式：类型
export type PropTypeShortcut =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ObjectConstructor
  | ArrayConstructor
  | FunctionConstructor

// props 定义对象
export interface WebComponentPropsDefinition {
  [propName: string]: WebComponentPropOptions | PropTypeShortcut | undefined
}

// ============================================
// Emits (自定义事件) 类型定义
// ============================================

// 事件参数类型
export type EmitsValidator = ((val: any) => boolean) | RegExp

// 事件定义
export interface WebComponentEmitsOptions {
  // 事件名称
  [eventName: string]: EmitsValidator | undefined
}

// 简写形式：字符串数组
export type WebComponentEmitsDefinition = string[] | WebComponentEmitsOptions

// ============================================
// Expose (暴露方法) 类型定义
// ============================================

// 暴露的方法或属性
export interface WebComponentExposeObject {
  [name: string]: () => any | any
}

// 暴露定义
export type WebComponentExposeDefinition = string[] | WebComponentExposeObject

// ============================================
// WebComponent 配置选项
// ============================================

export interface WebComponentOptions<P = any, E = any, X = any> {
  // 是否使用 Shadow DOM，默认 false（Light DOM，直接渲染到自定义元素内部）
  shadow?: boolean
  // Props 定义（类似 Vue3 defineComponent）
  props?: WebComponentPropsDefinition
  // Emits 定义（自定义事件）
  emits?: WebComponentEmitsDefinition
  // Expose 定义（暴露的方法/属性）
  expose?: WebComponentExposeDefinition
  // 要监听的属性列表（已废弃，由 props 定义自动生成）
  /** @deprecated 请使用 props 选项 */
  observedAttributes?: string[]
  // 将 attribute 映射到 props 的钩子（已废弃，由 props 定义自动生成）
  /** @deprecated 请使用 props 选项 */
  attributeToProps?: (name: string, value: string | null, props: P) => void
  // Store 相关配置
  store?: Store<any>
  storeGetter?: () => Store<any>
}

// ============================================
// 内部工具函数
// ============================================

/**
 * 从 props 定义提取 observedAttributes
 */
function extractObservedAttributes(
  props: WebComponentPropsDefinition | undefined,
): string[] {
  if (!props) return []

  const attributes: string[] = []
  for (const key in props) {
    const prop = props[key]
    if (!prop) continue

    // 如果是简写形式（构造函数），默认监听
    if (typeof prop === 'function') {
      attributes.push(key)
      continue
    }

    // 如果是对象形式，获取自定义 attribute 名或使用 prop 名
    const attrName = prop.attribute ?? key
    attributes.push(attrName)
  }

  return attributes
}

/**
 * 从 props 定义创建 attributeToProps 函数
 */
function createAttributeToProps<P extends object>(
  propsDefinition: WebComponentPropsDefinition,
  _existingProps: P,
): (name: string, value: string | null, props: P) => void {
  return function (name: string, value: string | null, props: P): void {
    // 查找对应的 prop 定义
    const propKey = findPropKey(propsDefinition, name)
    if (!propKey) {
      // 没有定义，直接赋值
      if (value !== null) {
        props[propKey as keyof P] = value as any
      }
      return
    }

    const propDef = propsDefinition[propKey]

    // propDef 不可能为 undefined，因为已经通过 propKey 查找过了
    if (!propDef) {
      props[propKey as keyof P] = value as any
      return
    }

    // 处理无值的情况（移除属性）
    if (value === null) {
      // 对于 Boolean 类型，默认为 false
      if (isBooleanConstructor(propDef)) {
        ;(props as any)[propKey] = false
      } else {
        delete (props as any)[propKey]
      }
      return
    }

    // 类型转换
    const convertedValue = convertAttributeValue(value, propDef)
    ;(props as any)[propKey] = convertedValue
  }
}

/**
 * 查找 attribute 对应的 prop 键
 */
function findPropKey(
  propsDefinition: WebComponentPropsDefinition,
  attributeName: string,
): string | undefined {
  for (const key in propsDefinition) {
    const prop = propsDefinition[key]
    if (!prop) continue

    // 构造函数形式
    if (typeof prop === 'function') {
      if (key === attributeName) return key
      continue
    }

    // 对象形式，检查 attribute
    if (prop.attribute === attributeName || key === attributeName) {
      return key
    }
  }

  return undefined
}

/**
 * 判断是否是 Boolean 构造函数
 */
function isBooleanConstructor(
  prop: WebComponentPropOptions | PropTypeShortcut | undefined,
): boolean {
  if (!prop) return false
  if (typeof prop === 'function') {
    return prop === Boolean
  }
  return prop.type === Boolean
}

/**
 * 将字符串值转换为正确的类型
 */
function convertAttributeValue<T = any>(
  value: string,
  propDef: WebComponentPropOptions<T> | PropTypeShortcut,
): T {
  // 处理构造函数简写形式
  const type = typeof propDef === 'function' ? propDef : propDef.type

  if (!type) {
    return value as any
  }

  if (type === String) {
    return value as any
  }

  if (type === Number) {
    const num = Number(value)
    return (isNaN(num) ? 0 : num) as any
  }

  if (type === Boolean) {
    // 任何非 "false" 的值都视为 true
    return (value !== 'false') as any
  }

  if (type === Object || type === Array) {
    try {
      return JSON.parse(value) as any
    } catch {
      return value as any
    }
  }

  if (type === Function) {
    try {
      return new Function('return ' + value)() as any
    } catch {
      return value as any
    }
  }

  return value as any
}

/**
 * 初始化 props 的默认值
 */
function initializeDefaults<P extends object>(
  propsDefinition: WebComponentPropsDefinition,
  props: P,
): void {
  for (const key in propsDefinition) {
    const prop = propsDefinition[key]
    if (!prop) continue

    // 构造函数简写形式，默认值为 undefined
    if (typeof prop === 'function') {
      continue
    }

    // 对象形式
    if ('default' in prop) {
      const defaultValue =
        typeof prop.default === 'function' ? prop.default() : prop.default
      ;(props as any)[key] = defaultValue
    }
  }
}

/**
 * 创建事件发射器
 */
function createEmitsCaller(
  emitsDefinition: WebComponentEmitsDefinition | undefined,
  element: HTMLElement,
): (event: string, data?: any) => void {
  return function (event: string, data?: any): void {
    // 验证事件是否在定义中
    let isValid = false

    if (emitsDefinition) {
      if (Array.isArray(emitsDefinition)) {
        isValid = emitsDefinition.includes(event)
      } else {
        isValid = event in emitsDefinition
      }
    }

    if (!isValid && emitsDefinition) {
      console.warn(`[WebComponent] Event "${event}" is not defined in emits.`)
      return
    }

    // 创建并派发自定义事件
    const customEvent = new CustomEvent(event, {
      bubbles: true,
      composed: true,
      detail: data,
    })

    element.dispatchEvent(customEvent)
  }
}

/**
 * 创建 expose 对象
 */
function createExpose(
  exposeDefinition: WebComponentExposeDefinition | undefined,
  context: {
    props: any
    element: HTMLElement
  },
): Record<string, any> {
  const exposed: Record<string, any> = {}

  if (!exposeDefinition) {
    return exposed
  }

  if (Array.isArray(exposeDefinition)) {
    // 字符串数组形式：直接暴露 props 中的值
    for (const key of exposeDefinition) {
      exposed[key] = context.props[key]
    }
  } else {
    // 对象形式：可以是函数或值
    for (const key in exposeDefinition) {
      const value = exposeDefinition[key]
      if (typeof value === 'function') {
        // 绑定函数到上下文
        exposed[key] = value.call(context)
      } else {
        exposed[key] = value
      }
    }
  }

  return exposed
}

// ============================================
// 主要导出
// ============================================

export function createWebComponentAdapter<
  P extends object = any,
  E = any,
  X = any,
>(
  component: ComponentFunction<P>,
  options?: WebComponentOptions<P, E, X>,
): typeof HTMLElement {
  const useShadow = !!(options && options.shadow)
  const propsDefinition = options && options.props
  const emitsDefinition = options && options.emits
  const exposeDefinition = options && options.expose

  // 从 props 定义提取 observedAttributes（优先使用）
  let observed: string[]
  let attributeToPropsFn: (name: string, value: string | null, props: P) => void

  if (propsDefinition) {
    observed = extractObservedAttributes(propsDefinition)
    // 创建默认的 attributeToProps
    attributeToPropsFn = createAttributeToProps(propsDefinition, {} as P)
  } else if (options) {
    // 兼容旧 API
    observed = options.observedAttributes
      ? options.observedAttributes.slice()
      : []
    attributeToPropsFn = options.attributeToProps
      ? options.attributeToProps
      : function (name: string, value: string | null, props: any): void {
          props[name] = value
        }
  } else {
    observed = []
    attributeToPropsFn = function (
      name: string,
      value: string | null,
      props: any,
    ): void {
      props[name] = value
    }
  }

  // Store 配置
  const store = options && options.store
  const storeGetter = options && options.storeGetter

  return class ZeusWebComponent extends HTMLElement {
    static get observedAttributes(): string[] {
      return observed
    }

    private _root: Element | ShadowRoot | null
    private _mounted: boolean
    private _props: P
    private _emits: (event: string, data?: any) => void
    private _exposed: Record<string, any>

    constructor() {
      super()
      this._mounted = false
      this._props = {} as P

      // 初始化默认值
      if (propsDefinition) {
        initializeDefaults(propsDefinition, this._props)
      }

      // 初始化 emits 函数
      this._emits = function (): void {
        // 会在 connectedCallback 中重新赋值
      }

      // 初始化 expose
      this._exposed = {}

      this._root = null
    }

    connectedCallback(): void {
      if (this._mounted) {
        return
      }

      // 初始化渲染根
      if (useShadow) {
        if (!this.shadowRoot) {
          this._root = this.attachShadow({ mode: 'open' })
        } else {
          this._root = this.shadowRoot
        }
      } else {
        this._root = this
      }

      // 初始化 emits 函数（绑定到当前元素）
      this._emits = createEmitsCaller(emitsDefinition, this)

      // 初始化 expose
      this._exposed = createExpose(exposeDefinition, {
        props: this._props,
        element: this,
      })

      // 初始化 props：先从已存在的 attributes 里读一遍
      this._initializePropsFromAttributes()

      // 初次渲染
      if (this._root) {
        render(() => {
          // 将 emits 和 expose 注入到 props 中传递给组件
          const componentProps = extend(
            { emits: this._emits, expose: this._exposed },
            this._props,
          )
          return component(componentProps as P)
        }, this._root as Element)
      }

      this._mounted = true
    }

    disconnectedCallback(): void {
      if (!this._mounted) {
        return
      }

      if (this._root) {
        ;(this._root as Element).innerHTML = ''
      }

      this._mounted = false
    }

    attributeChangedCallback(
      name: string,
      _oldValue: string | null,
      newValue: string | null,
    ): void {
      // 更新 props 并重新渲染
      attributeToPropsFn(name, newValue, this._props)

      // 更新 expose 中的 props 引用
      if (exposeDefinition) {
        this._exposed = createExpose(exposeDefinition, {
          props: this._props,
          element: this,
        })
      }

      if (this._mounted && this._root) {
        render(() => {
          const componentProps = extend(
            { emits: this._emits, expose: this._exposed },
            this._props,
          )
          return component(componentProps as P)
        }, this._root as Element)
      }
    }

    private _initializePropsFromAttributes(): void {
      const attrs = this.attributes
      const len = attrs.length
      for (let i = 0; i < len; i++) {
        const attr = attrs.item(i)
        if (!attr) continue
        const attrName = attr.name
        const value = attr.value
        attributeToPropsFn(attrName, value, this._props)
      }
    }

    // 公共方法：获取当前组件提供的 Store
    public getProvidedStore(): Store<any> | undefined {
      if (store) return store
      if (storeGetter) return storeGetter()
      return undefined
    }

    // 公共方法：获取暴露的方法/属性
    public getExposed(): Record<string, any> {
      return this._exposed
    }
  }
}

export function adaptToWebComponent<P extends object = any, E = any, X = any>(
  component: ComponentFunction<P>,
  options: WebComponentOptions<P, E, X> & {
    tagName: string
  },
): typeof HTMLElement {
  const ElementClass = createWebComponentAdapter(component, options)

  // 注册到全局 customElements，并记录到本地 registry
  registerComponent(options.tagName, ElementClass)

  return ElementClass
}

// ============================================
// Store 便捷方法
// ============================================

/**
 * 创建支持 Store 的 Web Component 的便捷方法
 *
 * @example
 * ```ts
 * const useCounterStore = defineStore({
 *   name: 'counter',
 *   state: { count: 0 }
 * })
 *
 * function Counter({ count, increment }) {
 *   return <button onClick={increment}>{count}</button>
 * }
 *
 * // 创建并注册组件
 * createStoreWebComponent('my-counter', Counter, useCounterStore)
 * ```
 */
export function createStoreWebComponent<P extends object, E = any, X = any>(
  tagName: string,
  component: ComponentFunction<P>,
  storeDefinition: ReturnType<typeof defineStore>,
  options?: Omit<WebComponentOptions<P, E, X>, 'store' | 'storeGetter'>,
): typeof HTMLElement {
  return adaptToWebComponent(
    component,
    extend({ tagName, storeGetter: storeDefinition }, options),
  )
}
