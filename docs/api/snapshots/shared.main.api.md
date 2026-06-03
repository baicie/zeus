# @zeus-js/shared (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
/**
 * Make a map and return a function for checking if a key
 * is in that map.
 * IMPORTANT: all calls of this function must be prefixed with
 * \/\*#\_\_PURE\_\_\*\/
 * So that rollup can tree-shake them if necessary.
 */
export declare function makeMap(str: string): (key: string) => boolean

export declare const EMPTY_OBJ: {
  readonly [key: string]: any
}
export declare const EMPTY_ARR: readonly never[]
export declare const NOOP: () => void
/**
 * Always return false.
 */
export declare const NO: () => boolean
export declare const isOn: (key: string) => boolean
export declare const isModelListener: (
  key: string,
) => key is `onUpdate:${string}`
export declare const extend: typeof Object.assign
export declare const remove: <T>(arr: T[], el: T) => void
export declare const hasOwn: (
  val: object,
  key: string | symbol,
) => key is keyof typeof val
export declare const isArray: typeof Array.isArray
export declare const isMap: (val: unknown) => val is Map<any, any>
export declare const isSet: (val: unknown) => val is Set<any>
export declare const isDate: (val: unknown) => val is Date
export declare const isRegExp: (val: unknown) => val is RegExp
export declare const isFunction: (val: unknown) => val is Function
export declare const isString: (val: unknown) => val is string
export declare const isSymbol: (val: unknown) => val is symbol
export declare const isObject: (val: unknown) => val is Record<any, any>
export declare const isPromise: <T = any>(val: unknown) => val is Promise<T>
export declare const objectToString: typeof Object.prototype.toString
export declare const toTypeString: (value: unknown) => string
export declare const toRawType: (value: unknown) => string
export declare const isPlainObject: (val: unknown) => val is object
export declare const isIntegerKey: (key: unknown) => boolean
/**
 * @private
 */
export declare const camelize: (str: string) => string
/**
 * @private
 */
export declare const hyphenate: (str: string) => string
/**
 * @private
 */
export declare const capitalize: <T extends string>(str: T) => Capitalize<T>
/**
 * @private
 */
export declare const toHandlerKey: <T extends string>(
  str: T,
) => T extends '' ? '' : `on${Capitalize<T>}`
export declare const hasChanged: (value: any, oldValue: any) => boolean
export declare const invokeArrayFns: (fns: Function[], ...arg: any[]) => void
export declare const def: (
  obj: object,
  key: string | symbol,
  value: any,
  writable?: boolean,
) => void
/**
 * "123-foo" will be parsed to 123
 * This is used for the .number modifier in v-model
 */
export declare const looseToNumber: (val: any) => any
/**
 * Only concerns number-like strings
 * "123-foo" will be returned as-is
 */
export declare const toNumber: (val: any) => any
export declare const getGlobalThis: () => any
export declare function genPropsAccessExp(name: string): string
export declare function genCacheKey(source: string, options: any): string

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never
export type LooseRequired<T> = {
  [P in keyof (T & Required<T>)]: T[P]
}
export type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N
export type IsKeyValues<T, K = string> = IfAny<
  T,
  false,
  T extends object ? (keyof T extends K ? true : false) : false
>
/**
 * Utility for extracting the parameters from a function overload (for typed emits)
 * https://github.com/microsoft/TypeScript/issues/32164#issuecomment-1146737709
 */
export type OverloadParameters<T extends (...args: any[]) => any> = Parameters<
  OverloadUnion<T>
>
type OverloadProps<TOverload> = Pick<TOverload, keyof TOverload>
type OverloadUnionRecursive<
  TOverload,
  TPartialOverload = unknown,
> = TOverload extends (...args: infer TArgs) => infer TReturn
  ? TPartialOverload extends TOverload
    ? never
    :
        | OverloadUnionRecursive<
            TPartialOverload & TOverload,
            TPartialOverload &
              ((...args: TArgs) => TReturn) &
              OverloadProps<TOverload>
          >
        | ((...args: TArgs) => TReturn)
  : never
type OverloadUnion<TOverload extends (...args: any[]) => any> = Exclude<
  OverloadUnionRecursive<(() => never) & TOverload>,
  TOverload extends () => never ? never : () => never
>
```
