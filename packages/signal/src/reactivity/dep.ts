import { isArray, isMap } from '@zeus-js/shared'

import { signal } from '../system'
import {
  ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
  type TrackOpTypes,
  TriggerOpTypes,
} from './constants'

export type Dep = ReturnType<typeof signal<number>>

const targetMap = new WeakMap<object, Map<PropertyKey, Dep>>()

function getDep(target: object, key: PropertyKey): Dep {
  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, (depsMap = new Map()))
  let dep = depsMap.get(key)
  if (!dep) depsMap.set(key, (dep = signal(0)))
  return dep
}

export function track(
  target: object,
  _type: TrackOpTypes,
  key: PropertyKey,
): void {
  getDep(target, key)()
}

function bump(dep: Dep | undefined): void {
  if (dep) dep(dep() + 1)
}

export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: PropertyKey,
  newValue?: unknown,
): void {
  const depsMap = targetMap.get(target)
  if (!depsMap) return

  if (type === TriggerOpTypes.CLEAR) {
    depsMap.forEach(bump)
    return
  }

  if (key !== undefined) bump(depsMap.get(key))

  if (isArray(target)) {
    if (key === 'length') {
      const length = Number(newValue)
      depsMap.forEach((dep, depKey) => {
        if (
          depKey === 'length' ||
          (typeof depKey === 'string' && Number(depKey) >= length)
        )
          bump(dep)
      })
    } else if (
      type === TriggerOpTypes.ADD &&
      typeof key === 'string' &&
      Number.isInteger(Number(key))
    ) {
      bump(depsMap.get('length'))
      bump(depsMap.get(ITERATE_KEY))
    } else if (type === TriggerOpTypes.DELETE) {
      bump(depsMap.get(ITERATE_KEY))
    }
    return
  }

  if (type === TriggerOpTypes.ADD || type === TriggerOpTypes.DELETE) {
    bump(depsMap.get(ITERATE_KEY))
    if (isMap(target)) bump(depsMap.get(MAP_KEY_ITERATE_KEY))
  } else if (type === TriggerOpTypes.SET && isMap(target)) {
    bump(depsMap.get(ITERATE_KEY))
  }
}
