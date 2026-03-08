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
