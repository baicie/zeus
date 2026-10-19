import {
  effect,
  getCurrentScope,
  onScopeDispose,
  stop,
} from '@zeus-js/signal/internal'

import { captureScopedSubtreeContext, ScopedSubtree } from './scopedSubtree'

import type { JSXValue } from './types'
import type { ReactiveEffectRunner } from '@zeus-js/signal/internal'

export type TransitionPhase = 'enter' | 'leave'

export type TransitionClassValue = string | readonly string[]

export interface TransitionClassSpec {
  from?: TransitionClassValue
  active?: TransitionClassValue
  to?: TransitionClassValue
}

export interface TransitionContext {
  readonly nodes: readonly Node[]
  readonly phase: TransitionPhase
  done: () => void
  cancel: () => void
}

export type TransitionCleanup = () => void

export type TransitionHookResult =
  | void
  | TransitionCleanup
  | Promise<void | TransitionCleanup>

/**
 * A hook with one argument receives a context. A two-argument hook receives
 * the nodes and a done callback, which is useful for callback-style animation
 * libraries. Returning a Promise is the async form of the same contract.
 */
export type TransitionHook =
  | ((context: TransitionContext) => TransitionHookResult)
  | ((nodes: readonly Node[], done: () => void) => TransitionHookResult)

export type TransitionSpec =
  | TransitionClassValue
  | TransitionClassSpec
  | TransitionHook

export type TransitionDuration =
  | number
  | PromiseLike<number>
  | (() => number | PromiseLike<number>)

export interface TransitionOptions {
  enter?: TransitionSpec
  leave?: TransitionSpec
  onEnter?: TransitionHook
  onLeave?: TransitionHook
  duration?:
    | TransitionDuration
    | {
        enter?: TransitionDuration
        leave?: TransitionDuration
      }
  onEnterDone?: () => void
  onLeaveDone?: () => void
  /** Skip visual hooks when the user agent requests reduced motion. */
  respectReducedMotion?: boolean
}

export interface TransitionHandle {
  readonly phase: TransitionPhase
  readonly promise: Promise<void>
  done: () => void
  cancel: () => void
  dispose: () => void
}

export interface TransitionProps extends TransitionOptions {
  when: unknown
  children?: JSXValue | (() => JSXValue)
  fallback?: JSXValue | (() => JSXValue)
}

type Complete = () => void

const TRANSITION_DURATION_INVALID = 'ZEUS_TRANSITION_DURATION_INVALID'

/**
 * Apply an enter or leave transition to an already mounted node range.
 *
 * A numeric duration is a timeout fallback. A Promise or Promise-returning
 * function is awaited. Callback hooks may call `done()` explicitly; calling
 * `done()` or `cancel()` more than once is harmless.
 */
export function transition(
  value: Node | readonly Node[],
  phase: TransitionPhase,
  options: TransitionOptions = {},
  complete?: Complete,
): TransitionHandle {
  const nodes = Array.isArray(value) ? value.slice() : [value]
  const reducedMotion =
    options.respectReducedMotion !== false && prefersReducedMotion()
  const spec = phase === 'enter' ? options.enter : options.leave
  const callback = phase === 'enter' ? options.onEnter : options.onLeave
  const duration = resolveDuration(options.duration, phase)

  let settled = false
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let classCleanup: TransitionCleanup | undefined
  const cleanups: TransitionCleanup[] = []
  let resolvePromise!: () => void
  let rejectPromise!: (error: unknown) => void

  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  // Runtime-owned transitions may finish asynchronously without a caller
  // awaiting their handle. Keep rejected hook promises from becoming global
  // unhandled rejections while preserving the original promise result.
  void promise.catch(() => undefined)

  const cleanup = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    classCleanup?.()
    classCleanup = undefined
    for (let index = cleanups.length - 1; index >= 0; index--) {
      try {
        cleanups[index]()
      } catch {
        // A transition cleanup must not prevent node removal or other cleanup.
      }
    }
    cleanups.length = 0
  }

  const finish = (error?: unknown, wasCancelled = false) => {
    if (settled) return
    settled = true
    cancelled = wasCancelled
    cleanup()

    if (error !== undefined) {
      rejectPromise(error)
      return
    }

    if (!cancelled) {
      complete?.()
      const done = phase === 'enter' ? options.onEnterDone : options.onLeaveDone
      done?.()
    }
    resolvePromise()
  }

  const done = () => finish()
  const cancel = () => finish(undefined, true)
  const context: TransitionContext = { nodes, phase, done, cancel }

  const handle: TransitionHandle = {
    phase,
    promise,
    done,
    cancel,
    dispose: cancel,
  }

  if (reducedMotion || typeof document === 'undefined') {
    finish()
    return handle
  }

  try {
    if (spec && !isHook(spec)) {
      classCleanup = applyClasses(nodes, spec)
    }

    const hooks: TransitionHook[] = []
    if (spec && isHook(spec)) hooks.push(spec)
    if (callback) hooks.push(callback)

    let callbackPending = false
    const callbackPromises: Promise<unknown>[] = []
    for (const hook of hooks) {
      const expectsDone = hook.length >= 2
      if (expectsDone) callbackPending = true

      const result = expectsDone
        ? (
            hook as (
              nodes: readonly Node[],
              done: () => void,
            ) => TransitionHookResult
          )(nodes, done)
        : (hook as (context: TransitionContext) => TransitionHookResult)(
            context,
          )

      if (typeof result === 'function') {
        if (settled) result()
        else cleanups.push(result)
      }
      if (isPromiseLike(result)) {
        callbackPending = true
        callbackPromises.push(
          Promise.resolve(result).then(cleanupResult => {
            if (typeof cleanupResult === 'function') {
              if (settled) cleanupResult()
              else cleanups.push(cleanupResult)
            }
          }),
        )
      }
    }

    let durationPending = false
    const finishWhenReady = () => {
      if (!callbackPending && !durationPending && !settled) done()
    }

    if (duration !== undefined) {
      if (typeof duration === 'number') {
        assertDuration(duration)
        if (duration > 0) {
          durationPending = true
          timer = setTimeout(() => {
            durationPending = false
            // A duration is the explicit fallback for callback-style hooks.
            done()
          }, duration)
        } else {
          durationPending = false
        }
      } else {
        durationPending = true
        callbackPromises.push(
          Promise.resolve(duration).then(value => {
            assertDuration(value)
            if (settled) return
            if (value > 0) {
              timer = setTimeout(() => {
                durationPending = false
                done()
              }, value)
            } else {
              durationPending = false
            }
          }),
        )
      }
    }

    if (callbackPromises.length > 0) {
      Promise.all(callbackPromises).then(
        () => {
          callbackPending = false
          finishWhenReady()
        },
        error => finish(error),
      )
    } else {
      finishWhenReady()
    }
  } catch (error) {
    finish(error)
    throw error
  }

  if (getCurrentScope()) {
    onScopeDispose(cancel, true)
  }

  return handle
}

/**
 * Mount a reactive transition region. This is the runtime lowering boundary
 * used by the native compiler's `<Transition>` intrinsic.
 */
export function mountTransition(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  options: TransitionOptions = {},
): void {
  const context = captureScopedSubtreeContext()
  let branch: TransitionBranch | undefined
  let disposed = false
  let runner: ReactiveEffectRunner | undefined

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (runner) stop(runner)
    const current = branch
    branch = undefined
    current?.handle?.cancel()
    current?.subtree.dispose()
  }

  const mount = () => {
    const subtree = new ScopedSubtree(parent, marker, context)
    subtree.replace(children)
    const next: TransitionBranch = {
      subtree,
      phase: 'enter',
    }
    branch = next
    try {
      next.handle = transition(subtree.current(), 'enter', options, () => {
        if (branch === next && next.phase === 'enter') next.phase = 'active'
      })
    } catch (error) {
      branch = undefined
      subtree.dispose()
      throw error
    }
  }

  const update = () => {
    if (disposed) return
    const visible = Boolean(when())
    const current = branch

    if (visible) {
      if (!current) {
        mount()
      } else if (current.phase === 'leave') {
        current.handle?.cancel()
        current.phase = 'enter'
        current.handle = transition(
          current.subtree.current(),
          'enter',
          options,
          () => {
            if (branch === current && current.phase === 'enter') {
              current.phase = 'active'
            }
          },
        )
      }
      return
    }

    if (!current || current.phase === 'leave') return

    current.phase = 'leave'
    current.handle = transition(
      current.subtree.current(),
      'leave',
      options,
      () => {
        if (branch !== current || current.phase !== 'leave') return
        branch = undefined
        current.subtree.dispose()
      },
    )
  }

  onScopeDispose(dispose, true)
  try {
    runner = effect(update)
  } catch (error) {
    dispose()
    throw error
  }
}

/**
 * Runtime value form for explicit calls. JSX compilation of this boundary is
 * The compiler lowers the intrinsic form to `mountTransition`; direct calls
 * remain available for runtime-only integrations.
 */
export function Transition(props: TransitionProps): JSXValue {
  assertValue(props.when, 'Transition `when`')
  const value = props.when ? props.children : props.fallback
  return typeof value === 'function' ? value() : (value ?? null)
}

interface TransitionBranch {
  subtree: ScopedSubtree
  phase: 'enter' | 'active' | 'leave'
  handle?: TransitionHandle
}

function resolveDuration(
  value: TransitionOptions['duration'],
  phase: TransitionPhase,
): number | PromiseLike<number> | undefined {
  if (value == null) return undefined
  if (typeof value === 'object' && !isPromiseLike(value)) {
    const phaseValue = phase === 'enter' ? value.enter : value.leave
    if (phaseValue == null) return undefined
    return typeof phaseValue === 'function' ? phaseValue() : phaseValue
  }
  if (typeof value === 'function') return value()
  return value
}

function isHook(value: TransitionSpec): value is TransitionHook {
  return typeof value === 'function'
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

function applyClasses(
  nodes: readonly Node[],
  spec: TransitionClassValue | TransitionClassSpec,
): TransitionCleanup {
  const classes = new Set<string>()
  let active = true
  const add = (value: TransitionClassValue | undefined) => {
    if (value == null) return
    const values = typeof value === 'string' ? value.split(/\s+/) : value
    for (const item of values) {
      if (item) classes.add(item)
    }
  }

  if (!isClassSpec(spec)) {
    add(spec)
  } else {
    add(spec.from)
    add(spec.active)
    Promise.resolve().then(() => {
      if (!active) return
      if (spec.from) removeClasses(nodes, spec.from)
      add(spec.to)
      if (spec.to) addClasses(nodes, spec.to)
    })
  }

  addClasses(nodes, [...classes])
  return () => {
    active = false
    removeClasses(nodes, [...classes, ...getClassValues(spec, 'to')])
  }
}

function getClassValues(
  spec: TransitionClassValue | TransitionClassSpec,
  key: 'to',
): string[] {
  if (!isClassSpec(spec)) return []
  const value = spec[key]
  if (value == null) return []
  return typeof value === 'string'
    ? value.split(/\s+/).filter(Boolean)
    : [...value]
}

function isClassSpec(
  value: TransitionClassValue | TransitionClassSpec,
): value is TransitionClassSpec {
  return typeof value === 'object' && !Array.isArray(value)
}

function addClasses(
  nodes: readonly Node[],
  values: TransitionClassValue,
): void {
  const classes = typeof values === 'string' ? values.split(/\s+/) : values
  for (const node of nodes) {
    if (!('classList' in node)) continue
    const classList = (node as Element).classList
    for (const value of classes) {
      if (value) classList.add(value)
    }
  }
}

function removeClasses(
  nodes: readonly Node[],
  values: TransitionClassValue,
): void {
  const classes = typeof values === 'string' ? values.split(/\s+/) : values
  for (const node of nodes) {
    if (!('classList' in node)) continue
    const classList = (node as Element).classList
    for (const value of classes) {
      if (value) classList.remove(value)
    }
  }
}

function assertDuration(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `${TRANSITION_DURATION_INVALID}: duration must be a finite non-negative number.`,
    )
  }
}

function prefersReducedMotion(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function assertValue(value: unknown, label: string): void {
  if (typeof value === 'function') {
    throw new TypeError(
      `[Zeus runtime] ${label} must be a value; call the function explicitly when reading a signal.`,
    )
  }
}
