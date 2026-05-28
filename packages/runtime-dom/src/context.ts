// packages/runtime-dom/src/context.ts
// Owner-based context tree for Zeus components.
// Public APIs: createContext, useContext, provide, inject
// Internal APIs: createOwner, runWithOwner, getCurrentOwner
// DOM bridge APIs: createDOMContextBoundary, provideDOMContext, requestDOMContext, resolveDOMContext

import { onScopeDispose } from '@zeus-js/signal'

import { insert } from './insert'

import type { JSXValue } from './types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ContextId = symbol

export interface Context<T = unknown> {
  readonly id: ContextId

  /**
   * The default value passed to createContext().
   *
   * Note:
   * - `defaultValue` itself may be `undefined`.
   * - Use `hasDefaultValue` to check whether a default value was provided.
   */
  readonly defaultValue: T | undefined
  readonly hasDefaultValue: boolean

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
 * @internal
 *
 * Avoid using this in normal code.
 * Most runtime paths should use runWithOwner() so owner restoration is guaranteed.
 */
export function setCurrentOwner(owner: Owner | undefined): void {
  currentOwner = owner
}

// ---------------------------------------------------------------------------
// createContext
// ---------------------------------------------------------------------------

export function createContext<T>(): Context<T>
export function createContext<T>(defaultValue: T): Context<T>
export function createContext<T>(defaultValue?: T): Context<T> {
  const hasDefaultValue = arguments.length > 0

  const context: Context<T> = {
    id: Symbol(__DEV__ ? 'ZeusContext' : ''),
    defaultValue,
    hasDefaultValue,

    Provider(props: ContextProviderProps<T>): JSXValue {
      const owner = createOwner(currentOwner)
      owner.provides.set(context.id, props.value)

      return runWithOwner(owner, () => {
        const children = resolveValue(props.children)

        if (props.bridge) {
          return createDOMContextBoundary(
            context as Context<unknown>,
            props.value,
            children,
          )
        }

        return children
      })
    },

    Bridge(props: ContextBridgeProps<T>): JSXValue {
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

  // Important:
  // fallback can be undefined, so do not check `fallback !== undefined`.
  // Use arguments.length to distinguish "no fallback provided" from "undefined".
  if (arguments.length >= 2) {
    return fallback as T
  }

  // Important:
  // defaultValue can be undefined, so use hasDefaultValue.
  if (context.hasDefaultValue) {
    return context.defaultValue as T
  }

  throw new Error(
    __DEV__
      ? `[Zeus context] No provider found for context.`
      : `Context value was not provided.`,
  )
}

export function useContext<T>(context: Context<T>): T
export function useContext<T>(context: Context<T>, fallback: T): T
export function useContext<T>(context: Context<T>, fallback?: T): T {
  if (arguments.length >= 2) {
    return inject(context, fallback as T)
  }

  return inject(context)
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

export interface DOMContextResolution<T> {
  found: boolean
  value: T | undefined
}

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
 * Internal precise DOM context resolver.
 *
 * Unlike requestDOMContext(), this can distinguish:
 * - found: false, value: undefined
 * - found: true, value: undefined
 */
export function resolveDOMContext<T>(
  host: HTMLElement,
  context: Context<T>,
): DOMContextResolution<T> {
  let found = false
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
          found = true
          value = nextValue
          this.resolved = true
          this.value = nextValue
        },
      },
    },
  )

  host.dispatchEvent(event)

  return { found, value }
}

/**
 * Public compatibility API.
 *
 * Returns the resolved value if found, otherwise undefined.
 * If you need to distinguish "not found" from "found undefined",
 * use resolveDOMContext().
 */
export function requestDOMContext<T>(
  host: HTMLElement,
  context: Context<T>,
): T | undefined {
  return resolveDOMContext(host, context).value
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
