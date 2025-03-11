import { isObject } from '@zeus/shared'

export function reactive<T extends object>(target: T): T {
  if (!isObject(target)) {
    return target
  }

  return new Proxy(target, {
    get(target, key) {
      const res = Reflect.get(target, key)
      track(target, key)
      return res
    },
    set(target, key, value) {
      const res = Reflect.set(target, key, value)
      trigger(target, key)
      return res
    },
  })
}

function track(target: object, key: unknown) {
  // 依赖收集
}

function trigger(target: object, key: unknown) {
  // 触发更新
}
