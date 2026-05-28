// packages/runtime-dom/src/context.ts
// Owner-based context tree for Zeus components.
// Public APIs: createContext, useContext, provide, inject
// Internal APIs: createOwner, runWithOwner, getCurrentOwner
// DOM bridge APIs: createDOMContextBoundary, provideDOMContext, requestDOMContext

import { onScopeDispose } from '@zeus-js/signal'

import { insert } from './insert'

import type { JSXValue } from './types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ContextId = symbol

export interface Context<T = unknown> {
  readonly id: ContextId
  readonly defaultValue?: T
  readonly Provider: ContextProvider<T>
  readonly Bridge: ContextBridge<T>
}

export interface ContextProviderProps<T> {
  value: T
  children?: JSXValue | (() => JSXValue)
  /**
   * When true, creates a DOM context boundary for native custom elements /
   * Web Components that live outside the Zeus owner tree.
   */
  bridge?: boolean
}

export interface ContextBridgeProps<T> {
  value: T
  children?: JSXValue | (() => JSXValue)
}

export type ContextProvider<T> = (props: ContextProviderProps<T>) => JSXValue
export type ContextBridge<T> = (props: ContextBridgeProps<T>) => JSXValue

// ---------------------------------------------------------------------------
// Owner tree
// ---------------------------------------------------------------------------

export interface Owner {
  parent?: Owner
  provides: Map<ContextId, unknown>
}

let currentOwner: Owner | undefined

export function getCurrentOwner(): Owner | undefined {
  return currentOwner
}

export function createOwner(parent: Owner | undefined = currentOwner): Owner {
  return {
    parent,
    provides: new Map(),
  }
}

export function runWithOwner<T>(owner: Owner | undefined, fn: () => T): T {
  const previous = currentOwner
  currentOwner = owner

  try {
    return fn()
  } finally {
    currentOwner = previous
  }
}

/**
 * Sets the current owner without saving/restoring the previous one.
 * Use this in synchronous execution contexts (like Provider) where the owner
 * should persist through the rest of the caller's synchronous execution.
 *
 * @internal
 */
export function setCurrentOwner(owner: Owner | undefined): void {
  currentOwner = owner
}

// ---------------------------------------------------------------------------
// createContext
// ---------------------------------------------------------------------------

export function createContext<T>(defaultValue?: T): Context<T> {
  const context: Context<T> = {
    id: Symbol(__DEV__ ? 'ZeusContext' : ''),
    defaultValue,

    Provider(props: ContextProviderProps<T>): JSXValue {
      const owner = createOwner(currentOwner)
      owner.provides.set(context.id, props.value)

      // Set the current owner to the new provider scope. We intentionally do NOT
      // restore the previous owner — the provider's synchronous execution
      // (evaluating children, rendering) must stay within this owner so that
      // any nested component calls see the provider's owner in the chain.
      setCurrentOwner(owner)

      const children = resolveValue(props.children)

      if (props.bridge) {
        return createDOMContextBoundary(
          context as Context<unknown>,
          props.value,
          children,
        )
      }

      return children
    },

    Bridge(props: ContextBridgeProps<unknown>): JSXValue {
      return createDOMContextBoundary(
        context as Context<unknown>,
        props.value,
        resolveValue(props.children),
      )
    },
  }

  return context
}

// ---------------------------------------------------------------------------
// provide / inject / useContext
// ---------------------------------------------------------------------------

export function provide<T>(context: Context<T>, value: T): void {
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

export function inject<T>(context: Context<T>): T
export function inject<T>(context: Context<T>, fallback: T): T
export function inject<T>(context: Context<T>, fallback?: T): T {
  let owner = currentOwner

  while (owner) {
    if (owner.provides.has(context.id)) {
      return owner.provides.get(context.id) as T
    }

    owner = owner.parent
  }

  if (fallback !== undefined) {
    return fallback
  }

  if (context.defaultValue !== undefined) {
    return context.defaultValue as T
  }

  throw new Error(
    __DEV__
      ? `[Zeus context] No provider found for context.`
      : `Context value was not provided.`,
  )
}

/**
 * Alias for `inject`, matching the standard hook naming convention.
 * Prefer `inject` when explicit type parameters are needed (e.g. `inject(ctx)<T>`).
 */
export function useContext<T>(context: Context<T>): T
export function useContext<T>(context: Context<T>, fallback: T): T
export function useContext<T>(context: Context<T>, fallback?: T): T {
  return inject(
    context as Context<T | undefined>,
    fallback as T | undefined,
  ) as T
}

// ---------------------------------------------------------------------------
// DOM Context Bridge (Web Component support)
// ---------------------------------------------------------------------------

export const ZEUS_CONTEXT_REQUEST = 'zeus:context-request'

export interface ZeusContextRequestDetail<T = unknown> {
  id: ContextId
  resolved: boolean
  value?: T
  resolve: (value: T) => void
}

export type ZeusContextRequestEvent<T = unknown> = CustomEvent<
  ZeusContextRequestDetail<T>
>

/**
 * Creates a transparent DOM element that acts as a context boundary.
 * Native custom elements inside it can use `requestDOMContext` to receive
 * context values via the DOM event protocol.
 */
export function createDOMContextBoundary<T>(
  context: Context<T>,
  value: T,
  children: JSXValue,
): Element {
  const boundary = document.createElement('zeus-context')

  // Minimal CSS to avoid affecting layout — display:contents makes the element
  // transparent to flex/grid/layout while still participating in the DOM tree.
  ;(boundary as HTMLElement).style.cssText =
    'display:contents;position:unset;width:0;height:0;overflow:hidden'

  provideDOMContext(boundary, context, value)

  insert(boundary, children)

  return boundary
}

/**
 * Registers a context value on a DOM target so that any descendant custom
 * element can pick it up via `requestDOMContext`.
 */
export function provideDOMContext<T>(
  target: EventTarget,
  context: Context<T>,
  value: T,
): void {
  const handler = (event: Event) => {
    const request = event as ZeusContextRequestEvent<T>

    if (request.type !== ZEUS_CONTEXT_REQUEST) return
    if (request.detail.id !== context.id) return

    request.stopPropagation()
    request.detail.resolve(value)
  }

  target.addEventListener(ZEUS_CONTEXT_REQUEST, handler as EventListener)

  // Clean up the event listener when the current effect scope is disposed.
  // The `true` flag tells onScopeDispose to not warn if no scope is active.
  onScopeDispose(() => {
    target.removeEventListener(ZEUS_CONTEXT_REQUEST, handler as EventListener)
  }, true)
}

/**
 * Dispatches a context-request event from the given host element. Walks up
 * the DOM tree until a `provideDOMContext` boundary is found that holds the
 * requested context.
 *
 * Returns the resolved value if a matching provider was found, otherwise
 * `undefined`.
 */
export function requestDOMContext<T>(
  host: HTMLElement,
  context: Context<T>,
): T | undefined {
  let resolved = false
  let value: T | undefined

  const event = new CustomEvent<ZeusContextRequestDetail<T>>(
    ZEUS_CONTEXT_REQUEST,
    {
      bubbles: true,
      // composed:true makes the event cross shadow-DOM boundaries.
      composed: true,
      cancelable: true,
      detail: {
        id: context.id,
        resolved: false,
        value: undefined,
        resolve(nextValue: T) {
          resolved = true
          value = nextValue
          this.resolved = true
          this.value = nextValue
        },
      },
    },
  )

  host.dispatchEvent(event)

  return resolved ? value : undefined
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
