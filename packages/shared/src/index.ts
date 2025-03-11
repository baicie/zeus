export const VERSION = '0.0.1'

export const isArray: (arg: any) => arg is any[] = Array.isArray
export const isObject = (val: unknown): val is Record<any, any> =>
  val !== null && typeof val === 'object'
export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'
