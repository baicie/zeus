export type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | undefined
  | null
export type Builtin =
  | Primitive
  | Function
  | Date
  | Error
  | RegExp
  | Promise<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>

export type DeepReactive<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
    ? Map<DeepReactive<K>, DeepReactive<V>>
    : T extends Set<infer V>
      ? Set<DeepReactive<V>>
      : T extends Array<infer V>
        ? Array<DeepReactive<V>>
        : { [K in keyof T]: DeepReactive<T[K]> }

export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends Set<infer V>
      ? ReadonlySet<DeepReadonly<V>>
      : T extends Array<infer V>
        ? ReadonlyArray<DeepReadonly<V>>
        : { readonly [K in keyof T]: DeepReadonly<T[K]> }

export type ShallowReactive<T extends object> = T
export type Raw<T> = T & { readonly __v_raw?: T }
