import {
  mergeProps as mergeSourceProps,
  normalizeDOMProps,
  resolveDOMProps,
} from '@zeus-js/shared'
import {
  computed,
  effect,
  onScopeDispose,
  stop,
  untrack,
} from '@zeus-js/signal/internal'

import { normalizeClass, patchStyle, setAttr } from './bindings'
import { setRef } from './refs'

import type { AttrValue, ClassValue, RefTarget } from './types'
import type { PropsSource } from '@zeus-js/shared'
import type { ReactiveEffectRunner } from '@zeus-js/signal/internal'

export function mergeProps<T extends object = Record<string, unknown>>(
  sources: readonly PropsSource[],
): T {
  return mergeSourceProps<T>(
    sources.map(source => {
      const value = computed(source)
      return () => value.value
    }),
  )
}

const structuralProperties = new Set([
  'innerHTML',
  'outerHTML',
  'textContent',
  'children',
])

export function bindSpread(
  el: Element,
  sources: readonly PropsSource[],
  onceSources: readonly number[] = [],
): void {
  const once = new Set(onceSources)
  const layers = sources.map((source, index) => {
    if (!once.has(index)) return () => normalizeDOMProps(source())
    let snapshot: Record<string, unknown> | undefined
    return () => {
      if (!snapshot)
        snapshot = untrack(() => {
          const value = normalizeDOMProps(source())
          if ('class' in value)
            value.class = normalizeClass(value.class as ClassValue)
          if (value.style && typeof value.style === 'object')
            value.style = { ...value.style }
          return value
        })
      return snapshot
    }
  })
  const values = layers.map(source => computed(source))
  let previous = new Map<string, unknown>()
  const listeners = new Map<string, EventListener>()
  let reference: RefTarget<Element> | null | undefined
  let styleSnapshot: ReturnType<typeof patchStyle> | undefined
  let disposed = false

  const cleanup = () => {
    if (disposed) return
    disposed = true
    for (const [name, listener] of listeners)
      el.removeEventListener(name, listener)
    listeners.clear()
    const target = reference
    reference = undefined
    setRef(target, null)
  }
  onScopeDispose(cleanup, true)

  let next = new Map<string, unknown>()
  let runner: ReactiveEffectRunner | undefined
  let flushing = false
  let pending = false

  const readProps = () => {
    next = resolveDOMProps(values.map(value => value.value))
    // Resolve nested class/style reads while tracking. Committing user refs
    // and custom-element setters must happen after the effect has exited.
    if (next.has('class'))
      next.set('class', normalizeClass(next.get('class') as ClassValue))
    const style = next.get('style')
    if (style && typeof style === 'object') next.set('style', { ...style })
  }

  function flush(read = true): void {
    pending ||= read
    if (flushing || disposed) return
    flushing = true
    let iterations = 0
    try {
      do {
        if (++iterations > 100)
          throw new Error(
            'JSX spread exceeded 100 synchronous updates; check refs and property setters for cyclic writes.',
          )
        const shouldRead = pending
        pending = false
        if (shouldRead) runner?.()
        untrack(() => {
          // Validate before changing the DOM, including dynamic keys.
          for (const key of next.keys()) {
            const property = key.startsWith('prop:') ? key.slice(5) : key
            if (structuralProperties.has(property)) {
              throw new TypeError(
                `Zeus JSX spread cannot write structural DOM property "${key}".`,
              )
            }
          }
          for (const key of previous.keys()) {
            if (disposed) return
            if (!next.has(key)) apply(key, undefined)
          }
          for (const [key, value] of next) {
            if (disposed) return
            apply(key, value)
          }
          previous = next
        })
      } while (pending && !disposed)
    } catch (error) {
      try {
        if (runner) stop(runner)
        cleanup()
      } finally {
        throw error
      }
    } finally {
      flushing = false
    }
  }

  try {
    runner = effect(readProps, { scheduler: () => flush() })
    flush(false)
  } catch (error) {
    try {
      cleanup()
    } finally {
      throw error
    }
  }

  function apply(key: string, value: unknown): void {
    if (key === 'ref') {
      if (reference === value) return
      const old = reference
      reference = undefined
      setRef(old, null)
      if (disposed) return
      reference = value as RefTarget<Element> | null | undefined
      setRef(reference, el)
      return
    }
    if (/^on/i.test(key) && key.length > 2) {
      const name = key.slice(2).toLowerCase()
      const old = listeners.get(name)
      if (old === value) return
      if (old) el.removeEventListener(name, old)
      listeners.delete(name)
      if (value != null) {
        if (typeof value !== 'function')
          throw new TypeError(`JSX event "${key}" requires a function.`)
        const listener = value as EventListener
        listeners.set(name, listener)
        el.addEventListener(name, listener)
      }
      return
    }
    if (key.startsWith('prop:')) {
      const property = key.slice(5)
      if (!Object.is(Reflect.get(el, property), value))
        Reflect.set(el, property, value)
      return
    }
    if (key === 'class' || key === 'className') {
      setAttr(el, 'class', normalizeClass(value as ClassValue) || null)
      return
    }
    if (key === 'style') {
      if (value == null || typeof value === 'string') {
        setAttr(el, 'style', value as AttrValue)
        styleSnapshot = undefined
      } else {
        if (!styleSnapshot) el.removeAttribute('style')
        styleSnapshot = patchStyle(
          el as HTMLElement,
          styleSnapshot,
          value as Record<string, string | number | null | undefined>,
        )
      }
      return
    }
    if (typeof value === 'function')
      throw new TypeError(
        `JSX attribute "${key}" cannot contain a function; use prop:${key} for function values.`,
      )
    setAttr(el, key, value as AttrValue)
  }
}
