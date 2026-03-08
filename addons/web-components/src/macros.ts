// ============================================
// 编译时宏函数
// ============================================
// 这些函数在编译时会被转换为纯对象字面量
// 运行时保留这些函数主要是为了：
// 1. TypeScript 类型检查和 IDE 支持
// 2. 如果代码中有对宏函数的引用，运行时不会报错
// 3. 提供良好的开发体验

import type {
  WebComponentEmitsDefinition,
  WebComponentExposeDefinition,
  WebComponentPropsDefinition,
} from './adapter'

// ============================================
// 宏函数类型定义
// ============================================

/**
 * Props 宏参数类型
 */
export type PropsParam<T extends WebComponentPropsDefinition = {}> = T

/**
 * Emits 宏参数类型
 */
export type EmitsParam<T extends WebComponentEmitsDefinition = []> = T

/**
 * Expose 宏参数类型
 */
export type ExposeParam<T extends WebComponentExposeDefinition = {}> = T

/**
 * withDefaults 参数类型
 */
export type DefaultsParam<T extends object = {}, D extends object = {}> = {
  props: T
  defaults: D
}

/**
 * defineProps - 定义组件 Props
 *
 * 编译时处理：
 * - 提取 props 定义对象的键
 * - 转换为纯对象字面量
 *
 * @example
 * ```ts
 * const props = defineProps({
 *   variant: { type: String, default: 'primary' },
 *   size: { type: String, default: 'medium' },
 *   disabled: Boolean,
 * })
 *
 * // 编译后：
 * const props = {
 *   variant: { type: String, default: 'primary' },
 *   size: { type: String, default: 'medium' },
 *   disabled: Boolean,
 * }
 * ```
 */
export function defineProps<T extends WebComponentPropsDefinition>(
  props: T,
): T {
  // 编译时会被替换为纯对象，运行时直接返回
  return props
}

/**
 * defineEmits - 定义组件 emits (自定义事件)
 *
 * 编译时处理：
 * - 提取 emits 定义对象的事件名
 * - 转换为纯对象字面量
 *
 * @example
 * ```ts
 * const emits = defineEmits({
 *   click: undefined,
 *   custom: (val) => typeof val === 'string',
 * })
 *
 * // 编译后：
 * const emits = {
 *   click: undefined,
 *   custom: (val) => typeof val === 'string',
 * }
 * ```
 */
export function defineEmits<T extends WebComponentEmitsDefinition>(
  emits: T,
): T {
  return emits
}

/**
 * defineExpose - 定义组件暴露的方法和属性
 *
 * 编译时处理：
 * - 提取 expose 定义对象的键
 * - 转换为纯对象字面量
 *
 * @example
 * ```ts
 * const expose = defineExpose({
 *   focus: function() { console.log('focused'); },
 *   value: 'some value',
 * })
 *
 * // 编译后：
 * const expose = {
 *   focus: function() { console.log('focused'); },
 *   value: 'some value',
 * }
 * ```
 */
export function defineExpose<T extends WebComponentExposeDefinition>(
  expose: T,
): T {
  return expose
}

/**
 * withDefaults - 为 props 提供默认值
 *
 * 编译时处理：
 * - 将默认值合并到 props 定义中
 *
 * @example
 * ```ts
 * const props = withDefaults(defineProps({
 *   variant: String,
 *   size: String,
 * }), {
 *   variant: 'primary',
 *   size: 'medium',
 * })
 * ```
 */
export function withDefaults<T extends object, D extends object>(
  props: T,
  defaults: D,
): T & D {
  return Object.assign({}, defaults, props)
}

// ============================================
// 宏类型推断辅助
// ============================================

/**
 * 从 defineProps 返回值推断 props 类型
 */
export type ExtractProps<T> =
  T extends ReturnType<typeof defineProps> ? T : never

/**
 * 从 defineEmits 返回值推断 emits 类型
 */
export type ExtractEmits<T> =
  T extends ReturnType<typeof defineEmits> ? T : never

/**
 * 从 defineExpose 返回值推断 expose 类型
 */
export type ExtractExpose<T> =
  T extends ReturnType<typeof defineExpose> ? T : never

// ============================================
// 运行时辅助函数
// ============================================

/**
 * 创建 props 验证器
 * 用于运行时验证传入的 props
 */
export function createPropsValidator<T extends WebComponentPropsDefinition>(
  propsDef: T,
) {
  return function (props: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {}

    for (const key in propsDef) {
      const propDef = propsDef[key]
      const value = props[key]

      if (value !== undefined) {
        // 类型验证
        if (typeof propDef === 'function') {
          // 构造函数类型检查
          const expectedType = propDef.name.toLowerCase()
          const actualType = typeof value

          if (expectedType === 'boolean' && actualType !== 'boolean') {
            console.warn(`Props "${key}" expected Boolean, got ${actualType}`)
          } else if (expectedType === 'number' && actualType !== 'number') {
            console.warn(`Props "${key}" expected Number, got ${actualType}`)
          } else if (expectedType === 'string' && actualType !== 'string') {
            console.warn(`Props "${key}" expected String, got ${actualType}`)
          }
        } else if (propDef && typeof propDef === 'object') {
          // 对象类型检查
          const propOptions = propDef as {
            type?: Function
            required?: boolean
            default?: any
          }

          // 检查必需属性
          if (propOptions.required && value === undefined) {
            console.warn(`Props "${key}" is required`)
          }

          // 类型验证
          if (propOptions.type && typeof propOptions.type === 'function') {
            const expectedType = propOptions.type.name.toLowerCase()
            const actualType = typeof value

            if (expectedType === 'boolean' && actualType !== 'boolean') {
              console.warn(`Props "${key}" expected Boolean, got ${actualType}`)
            }
          }
        }

        result[key] = value
      } else if (
        propDef &&
        typeof propDef === 'object' &&
        (propDef as any).default !== undefined
      ) {
        // 使用默认值
        const defaultValue = (propDef as any).default
        result[key] =
          typeof defaultValue === 'function' ? defaultValue() : defaultValue
      }
    }

    return result
  }
}

/**
 * 创建 emits 验证器
 * 用于运行时验证 emit 的事件
 */
export function createEmitsValidator<T extends WebComponentEmitsDefinition>(
  emitsDef: T,
) {
  const events = Array.isArray(emitsDef)
    ? emitsDef
    : Object.keys(emitsDef || {})

  return function (event: string, payload?: any): boolean {
    if (!events.includes(event)) {
      console.warn(`Unknown emit event: "${event}"`)
      return false
    }

    // 如果有验证函数，进行验证
    if (!Array.isArray(emitsDef) && emitsDef[event]) {
      const validator = emitsDef[event]
      if (typeof validator === 'function') {
        const valid = validator(payload)
        if (!valid) {
          console.warn(
            `Emit "${event}" validation failed for payload:`,
            payload,
          )
        }
        return valid
      }
    }

    return true
  }
}

/**
 * 合并 props 和默认值
 * 运行时辅助函数
 */
export function mergeProps<T extends Record<string, any>>(
  props: T,
  defaults: Record<string, any>,
): T {
  return Object.assign({}, defaults, props)
}
