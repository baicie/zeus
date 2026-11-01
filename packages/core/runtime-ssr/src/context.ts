// packages/core/runtime-ssr/src/context.ts
//
// Server-side context tree. The DOM runtime uses an owner chain to resolve
// `createContext` / `provide` / `inject`; SSR needs the same semantics while
// rendering, without any DOM global. This module mirrors the public shape of
// `runtime-dom/src/context.ts` — the same context value works on both targets
// because both create objects with `id`, `defaultValue`, `hasDefaultValue`,
// `Provider` and `Bridge`.

import type { SSRNode } from './types'

export type ContextId = symbol

export interface SSRContextProviderProps<T> {
  value: T
  children?: SSRNode | (() => SSRNode)
  /**
   * Accepted for parity with the DOM runtime. SSR has no DOM boundary to
   * create, so the server renders the children in the same owner tree.
   */
  bridge?: boolean
}

export interface SSRContextBridgeProps<T> {
  value: T
  children?: SSRNode | (() => SSRNode)
}

export interface SSRContext<T = unknown> {
  readonly id: ContextId
  readonly defaultValue: T | undefined
  readonly hasDefaultValue: boolean
  readonly Provider: (props: SSRContextProviderProps<T>) => SSRNode
  readonly Bridge: (props: SSRContextBridgeProps<T>) => SSRNode
}

export interface SSROwner {
  parent?: SSROwner
  provides: Map<ContextId, unknown>
  disposed?: boolean
}

let currentOwner: SSROwner | undefined

export function getSSRCurrentOwner(): SSROwner | undefined {
  return currentOwner
}

export function createSSROwner(
  parent: SSROwner | undefined = currentOwner,
): SSROwner {
  return { parent, provides: new Map() }
}

export function runWithSSROwner<T>(
  owner: SSROwner | undefined,
  fn: () => T,
): T {
  const previous = currentOwner
  currentOwner = owner

  try {
    return fn()
  } finally {
    currentOwner = previous
  }
}

export function disposeSSROwner(owner: SSROwner): void {
  if (owner.disposed) return
  owner.disposed = true
  owner.provides.clear()
}

export function createContext<T>(): SSRContext<T>
export function createContext<T>(defaultValue: T): SSRContext<T>
export function createContext<T>(defaultValue?: T): SSRContext<T> {
  const hasDefaultValue = arguments.length > 0

  const context: SSRContext<T> = {
    id: Symbol(__DEV__ ? 'ZeusContext' : ''),
    defaultValue,
    hasDefaultValue,

    Provider(props: SSRContextProviderProps<T>): SSRNode {
      return runWithSSROwner(createSSROwner(), () => {
        provide(context, props.value)
        return resolveValue(props.children)
      })
    },

    // The DOM runtime inserts a transparent boundary element so native custom
    // elements can request the value through an event. SSR has no elements to
    // bridge to: a server-rendered custom element receives its context after
    // upgrade, so the boundary is transparent.
    Bridge(props: SSRContextBridgeProps<T>): SSRNode {
      return runWithSSROwner(createSSROwner(), () => {
        provide(context, props.value)
        return resolveValue(props.children)
      })
    },
  }

  return context
}

export function provide<T>(context: SSRContext<T>, value: T): void {
  const owner = currentOwner

  if (!owner) {
    if (__DEV__) {
      console.warn(
        '[Zeus context] provide() was called without an active component owner.',
      )
    }

    return
  }

  owner.provides.set(context.id, value)
}

export function inject<T>(context: SSRContext<T>): T
export function inject<T>(context: SSRContext<T>, fallback: T): T
export function inject<T>(context: SSRContext<T>, fallback?: T): T {
  let owner = currentOwner

  while (owner) {
    if (owner.provides.has(context.id)) {
      return owner.provides.get(context.id) as T
    }

    owner = owner.parent
  }

  if (arguments.length >= 2) return fallback as T

  if (context.hasDefaultValue) return context.defaultValue as T

  throw new Error(
    __DEV__
      ? `[Zeus context] No provider found for context.`
      : `Context value was not provided.`,
  )
}

export function useContext<T>(context: SSRContext<T>): T
export function useContext<T>(context: SSRContext<T>, fallback: T): T
export function useContext<T>(context: SSRContext<T>, fallback?: T): T {
  if (arguments.length >= 2) return inject(context, fallback as T)

  return inject(context)
}

function resolveValue(value: SSRNode | (() => SSRNode) | undefined): SSRNode {
  return typeof value === 'function' ? value() : (value ?? null)
}
