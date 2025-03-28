// Inspired by S.js by Adam Haile, https://github.com/adamhaile/S
/**
The MIT License (MIT)

Copyright (c) 2017 Adam Haile

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export const $TRACK: unique symbol = Symbol('solid-track')
export const equalFn = <T>(a: T, b: T): boolean => a === b
const signalOptions = { equals: equalFn }
let ERROR: symbol | null = null
let runEffects = runQueue
const STALE = 1
const PENDING = 2
const UNOWNED: Owner = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null,
}
export var Owner: Owner | null = null
export let Transition: TransitionState | null = null
let Scheduler: ((fn: () => void) => any) | null = null
let ExternalSourceConfig: {
  factory: ExternalSourceFactory
  untrack: <V>(fn: () => V) => V
} | null = null
let Listener: Computation<any> | null = null
let Updates: Computation<any>[] | null = null
let Effects: Computation<any>[] | null = null
let ExecCount = 0

/** Object storing callbacks for debugging during development */
export const DevHooks: {
  afterUpdate: (() => void) | null
  afterCreateOwner: ((owner: Owner) => void) | null
  /** @deprecated use `afterRegisterGraph` */
  afterCreateSignal: ((signal: SignalState<any>) => void) | null
  afterRegisterGraph: ((sourceMapValue: SourceMapValue) => void) | null
} = {
  afterUpdate: null,
  afterCreateOwner: null,
  afterCreateSignal: null,
  afterRegisterGraph: null,
}

export type ComputationState = 0 | 1 | 2

export interface SourceMapValue {
  value: unknown
  name?: string
  graph?: Owner
}

export interface SignalState<T> extends SourceMapValue {
  value: T
  observers: Computation<any>[] | null
  observerSlots: number[] | null
  tValue?: T
  comparator?: (prev: T, next: T) => boolean
  // development-only
  internal?: true
}

export interface Owner {
  owned: Computation<any>[] | null
  cleanups: (() => void)[] | null
  owner: Owner | null
  context: any | null
  sourceMap?: SourceMapValue[]
  name?: string
}

export interface Computation<Init, Next extends Init = Init> extends Owner {
  fn: EffectFunction<Init, Next>
  state: ComputationState
  tState?: ComputationState
  sources: SignalState<Next>[] | null
  sourceSlots: number[] | null
  value?: Init
  updatedAt: number | null
  pure: boolean
  user?: boolean
  // suspense?: SuspenseContextType
}

export interface TransitionState {
  sources: Set<SignalState<any>>
  effects: Computation<any>[]
  promises: Set<Promise<any>>
  disposed: Set<Computation<any>>
  queue: Set<Computation<any>>
  scheduler?: (fn: () => void) => unknown
  running: boolean
  done?: Promise<void>
  resolve?: () => void
}

type ExternalSourceFactory = <Prev, Next extends Prev = Prev>(
  fn: EffectFunction<Prev, Next>,
  trigger: () => void
) => ExternalSource

export interface ExternalSource {
  track: EffectFunction<any, any>
  dispose: () => void
}

export type RootFunction<T> = (dispose: () => void) => T

/**
 * Creates a new non-tracked reactive context that doesn't auto-dispose
 *
 * @param fn a function in which the reactive state is scoped
 * @param detachedOwner optional reactive context to bind the root to
 * @returns the output of `fn`.
 *
 * @description https://docs.solidjs.com/reference/reactive-utilities/create-root
 */
export function createRoot<T>(
  fn: RootFunction<T>,
  detachedOwner?: typeof Owner
): T {
  const listener = Listener,
    owner = Owner,
    unowned = fn.length === 0,
    current = detachedOwner === undefined ? owner : detachedOwner,
    root: Owner = unowned
      ? __DEV__
        ? { owned: null, cleanups: null, context: null, owner: null }
        : UNOWNED
      : {
          owned: null,
          cleanups: null,
          context: current ? current.context : null,
          owner: current,
        },
    updateFn = unowned
      ? __DEV__
        ? () =>
            fn(() => {
              throw new Error(
                'Dispose method must be an explicit argument to createRoot function'
              )
            })
        : fn
      : () => fn(() => untrack(() => cleanNode(root)))

  if (__DEV__) DevHooks.afterCreateOwner && DevHooks.afterCreateOwner(root)

  Owner = root
  Listener = null

  try {
    return runUpdates(updateFn as () => T, true)!
  } finally {
    Listener = listener
    Owner = owner
  }
}

export type Accessor<T> = () => T

export type Setter<in out T> = {
  <U extends T>(
    ...args: undefined extends T
      ? []
      : [value: Exclude<U, Function> | ((prev: T) => U)]
  ): undefined extends T ? undefined : U
  <U extends T>(value: (prev: T) => U): U
  <U extends T>(value: Exclude<U, Function>): U
  <U extends T>(value: Exclude<U, Function> | ((prev: T) => U)): U
}

export type Signal<T> = [get: Accessor<T>, set: Setter<T>]

export interface SignalOptions<T> extends MemoOptions<T> {
  internal?: boolean
}

export function createSignal<T>(): Signal<T | undefined>
export function createSignal<T>(value: T, options?: SignalOptions<T>): Signal<T>
export function createSignal<T>(
  value?: T,
  options?: SignalOptions<T | undefined>
): Signal<T | undefined> {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions

  const s: SignalState<T | undefined> = {
    value,
    observers: null,
    observerSlots: null,
    comparator: options.equals || undefined,
  }

  if (__DEV__) {
    if (options.name) s.name = options.name
    if (options.internal) {
      s.internal = true
    } else {
      registerGraph(s)
      if (DevHooks.afterCreateSignal) DevHooks.afterCreateSignal(s)
    }
  }

  const setter: Setter<T | undefined> = (value?: unknown) => {
    if (typeof value === 'function') {
      if (Transition && Transition.running && Transition.sources.has(s))
        value = value(s.tValue)
      else value = value(s.value)
    }
    return writeSignal(s, value as T | undefined)
  }

  return [readSignal.bind(s), setter]
}

export interface BaseOptions {
  name?: string
}

// Magic type that when used at sites where generic types are inferred from, will prevent those sites from being involved in the inference.
// https://github.com/microsoft/TypeScript/issues/14829
// TypeScript Discord conversation: https://discord.com/channels/508357248330760243/508357248330760249/911266491024949328
export type NoInfer<T extends any> = [T][T extends any ? 0 : never]

export interface EffectOptions extends BaseOptions {}

// Also similar to OnEffectFunction
export type EffectFunction<Prev, Next extends Prev = Prev> = (v: Prev) => Next

export function createComputed<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>
): void
export function createComputed<Next, Init = Next>(
  fn: EffectFunction<Init | Next, Next>,
  value: Init,
  options?: EffectOptions
): void
export function createComputed<Next, Init>(
  fn: EffectFunction<Init | Next, Next>,
  value?: Init,
  options?: EffectOptions
): void {
  const c = createComputation(
    fn,
    value!,
    true,
    STALE,
    __DEV__ ? options : undefined
  )
  if (Scheduler && Transition && Transition.running) Updates!.push(c)
  else updateComputation(c)
}

export function createEffect<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>
): void
export function createEffect<Next, Init = Next>(
  fn: EffectFunction<Init | Next, Next>,
  value: Init,
  options?: EffectOptions & { render?: boolean }
): void
export function createEffect<Next, Init>(
  fn: EffectFunction<Init | Next, Next>,
  value?: Init,
  options?: EffectOptions & { render?: boolean }
): void {
  const c = createComputation(
    fn,
    value!,
    false,
    STALE,
    __DEV__ ? options : undefined
  )
  if (!options || !options.render) c.user = true
  Effects ? Effects.push(c) : updateComputation(c)
}

export interface Memo<Prev, Next = Prev>
  extends SignalState<Next>,
    Computation<Next> {
  value: Next
  tOwned?: Computation<Prev | Next, Next>[]
}

export interface MemoOptions<T> extends EffectOptions {
  equals?: false | ((prev: T, next: T) => boolean)
}

export function createMemo<Next extends Prev, Prev = Next>(
  fn: EffectFunction<undefined | NoInfer<Prev>, Next>
): Accessor<Next>
export function createMemo<Next extends Prev, Init = Next, Prev = Next>(
  fn: EffectFunction<Init | Prev, Next>,
  value: Init,
  options?: MemoOptions<Next>
): Accessor<Next>
export function createMemo<Next extends Prev, Init, Prev>(
  fn: EffectFunction<Init | Prev, Next>,
  value?: Init,
  options?: MemoOptions<Next>
): Accessor<Next> {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions

  const c: Partial<Memo<Init, Next>> = createComputation(
    fn,
    value!,
    true,
    0,
    __DEV__ ? options : undefined
  ) as Partial<Memo<Init, Next>>

  c.observers = null
  c.observerSlots = null
  c.comparator = options.equals || undefined
  if (Scheduler && Transition && Transition.running) {
    c.tState = STALE
    Updates!.push(c as Memo<Init, Next>)
  } else updateComputation(c as Memo<Init, Next>)
  return readSignal.bind(c as Memo<Init, Next>)
}

interface Unresolved {
  state: 'unresolved'
  loading: false
  error: undefined
  latest: undefined
  (): undefined
}

interface Pending {
  state: 'pending'
  loading: true
  error: undefined
  latest: undefined
  (): undefined
}

interface Ready<T> {
  state: 'ready'
  loading: false
  error: undefined
  latest: T
  (): T
}

interface Refreshing<T> {
  state: 'refreshing'
  loading: true
  error: undefined
  latest: T
  (): T
}

interface Errored {
  state: 'errored'
  loading: false
  error: any
  latest: never
  (): never
}

export type Resource<T> =
  | Unresolved
  | Pending
  | Ready<T>
  | Refreshing<T>
  | Errored

export type InitializedResource<T> = Ready<T> | Refreshing<T> | Errored

export type ResourceActions<T, R = unknown> = {
  mutate: Setter<T>
  refetch: (info?: R) => T | Promise<T> | undefined | null
}

export type ResourceSource<S> =
  | S
  | false
  | null
  | undefined
  | (() => S | false | null | undefined)

export type ResourceFetcher<S, T, R = unknown> = (
  k: S,
  info: ResourceFetcherInfo<T, R>
) => T | Promise<T>

export type ResourceFetcherInfo<T, R = unknown> = {
  value: T | undefined
  refetching: R | boolean
}

export type ResourceOptions<T, S = unknown> = {
  initialValue?: T
  name?: string
  deferStream?: boolean
  ssrLoadFrom?: 'initial' | 'server'
  storage?: (
    init: T | undefined
  ) => [Accessor<T | undefined>, Setter<T | undefined>]
  onHydrated?: (k: S | undefined, info: { value: T | undefined }) => void
}

export type InitializedResourceOptions<T, S = unknown> = ResourceOptions<
  T,
  S
> & {
  initialValue: T
}

export type ResourceReturn<T, R = unknown> = [
  Resource<T>,
  ResourceActions<T | undefined, R>
]

export type InitializedResourceReturn<T, R = unknown> = [
  InitializedResource<T>,
  ResourceActions<T, R>
]

export interface DeferredOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean)
  name?: string
  timeoutMs?: number
}

export type EqualityCheckerFunction<T, U> = (a: U, b: T) => boolean

export function untrack<T>(fn: Accessor<T>): T {
  if (!ExternalSourceConfig && Listener === null) return fn()

  const listener = Listener
  Listener = null
  try {
    if (ExternalSourceConfig) return ExternalSourceConfig.untrack(fn)
    return fn()
  } finally {
    Listener = listener
  }
}

/** @deprecated */
export type ReturnTypes<T> = T extends readonly Accessor<unknown>[]
  ? { [K in keyof T]: T[K] extends Accessor<infer I> ? I : never }
  : T extends Accessor<infer I>
  ? I
  : never

// transforms a tuple to a tuple of accessors in a way that allows generics to be inferred
export type AccessorArray<T> = [
  ...Extract<{ [K in keyof T]: Accessor<T[K]> }, readonly unknown[]>
]

// Also similar to EffectFunction
export type OnEffectFunction<S, Prev, Next extends Prev = Prev> = (
  input: S,
  prevInput: S | undefined,
  prev: Prev
) => Next

export interface DevComponent<T> extends Memo<unknown> {
  props: T
  name: string
  component: (props: T) => unknown
}

export function registerGraph(value: SourceMapValue): void {
  if (Owner) {
    if (Owner.sourceMap) Owner.sourceMap.push(value)
    else Owner.sourceMap = [value]
    value.graph = Owner
  }
  if (DevHooks.afterRegisterGraph) DevHooks.afterRegisterGraph(value)
}

export function onCleanup<T extends () => any>(fn: T): T {
  if (Owner === null)
    __DEV__ &&
      console.warn(
        'cleanups created outside a `createRoot` or `render` will never be run'
      )
  else if (Owner.cleanups === null) Owner.cleanups = [fn]
  else Owner.cleanups.push(fn)
  return fn
}

// Internal
export function readSignal(
  this: SignalState<any> | Memo<any>
): ReturnType<Accessor<any>> {
  const runningTransition = Transition && Transition.running
  if (
    (this as Memo<any>).sources &&
    (runningTransition ? (this as Memo<any>).tState : (this as Memo<any>).state)
  ) {
    if (
      (runningTransition
        ? (this as Memo<any>).tState
        : (this as Memo<any>).state) === STALE
    )
      updateComputation(this as Memo<any>)
    else {
      const updates = Updates
      Updates = null
      runUpdates(() => lookUpstream(this as Memo<any>), false)
      Updates = updates
    }
  }
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0
    if (!Listener.sources) {
      Listener.sources = [this]
      Listener.sourceSlots = [sSlot]
    } else {
      Listener.sources.push(this)
      Listener.sourceSlots!.push(sSlot)
    }
    if (!this.observers) {
      this.observers = [Listener]
      this.observerSlots = [Listener.sources.length - 1]
    } else {
      this.observers.push(Listener)
      this.observerSlots!.push(Listener.sources.length - 1)
    }
  }
  if (runningTransition && Transition!.sources.has(this)) return this.tValue
  return this.value
}

export function writeSignal(
  node: SignalState<any> | Memo<any>,
  value: any,
  isComp?: boolean
): any {
  let current =
    Transition && Transition.running && Transition.sources.has(node)
      ? node.tValue
      : node.value
  if (!node.comparator || !node.comparator(current, value)) {
    if (Transition) {
      const TransitionRunning = Transition.running
      if (TransitionRunning || (!isComp && Transition.sources.has(node))) {
        Transition.sources.add(node)
        node.tValue = value
      }
      if (!TransitionRunning) node.value = value
    } else node.value = value
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers!.length; i += 1) {
          const o = node.observers![i]
          const TransitionRunning = Transition && Transition.running
          if (TransitionRunning && Transition!.disposed.has(o)) continue
          if (TransitionRunning ? !o.tState : !o.state) {
            if (o.pure) Updates!.push(o)
            else Effects!.push(o)
            if ((o as Memo<any>).observers) markDownstream(o as Memo<any>)
          }
          if (!TransitionRunning) o.state = STALE
          else o.tState = STALE
        }
        if (Updates!.length > 10e5) {
          Updates = []
          if (__DEV__) throw new Error('Potential Infinite Loop Detected.')
          throw new Error()
        }
      }, false)
    }
  }
  return value
}

function updateComputation(node: Computation<any>) {
  if (!node.fn) return
  cleanNode(node)
  const time = ExecCount
  runComputation(
    node,
    Transition &&
      Transition.running &&
      Transition.sources.has(node as Memo<any>)
      ? (node as Memo<any>).tValue
      : node.value,
    time
  )

  if (
    Transition &&
    !Transition.running &&
    Transition.sources.has(node as Memo<any>)
  ) {
    queueMicrotask(() => {
      runUpdates(() => {
        Transition && (Transition.running = true)
        Listener = Owner = node
        runComputation(node, (node as Memo<any>).tValue, time)
        Listener = Owner = null
      }, false)
    })
  }
}

function runComputation(node: Computation<any>, value: any, time: number) {
  let nextValue
  const owner = Owner,
    listener = Listener
  Listener = Owner = node
  try {
    nextValue = node.fn(value)
  } catch (err) {
    if (node.pure) {
      if (Transition && Transition.running) {
        node.tState = STALE
        ;(node as Memo<any>).tOwned &&
          (node as Memo<any>).tOwned!.forEach(cleanNode)
        ;(node as Memo<any>).tOwned = undefined
      } else {
        node.state = STALE
        node.owned && node.owned.forEach(cleanNode)
        node.owned = null
      }
    }
    // won't be picked up until next update
    node.updatedAt = time + 1
    return handleError(err)
  } finally {
    Listener = listener
    Owner = owner
  }
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && 'observers' in node) {
      writeSignal(node as Memo<any>, nextValue, true)
    } else if (Transition && Transition.running && node.pure) {
      Transition.sources.add(node as Memo<any>)
      ;(node as Memo<any>).tValue = nextValue
    } else node.value = nextValue
    node.updatedAt = time
  }
}

function createComputation<Next, Init = unknown>(
  fn: EffectFunction<Init | Next, Next>,
  init: Init,
  pure: boolean,
  state: ComputationState = STALE,
  options?: EffectOptions
): Computation<Init | Next, Next> {
  const c: Computation<Init | Next, Next> = {
    fn,
    state: state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: init,
    owner: Owner,
    context: Owner ? Owner.context : null,
    pure,
  }

  if (Transition && Transition.running) {
    c.state = 0
    c.tState = state
  }

  if (Owner === null)
    __DEV__ &&
      console.warn(
        'computations created outside a `createRoot` or `render` will never be disposed'
      )
  else if (Owner !== UNOWNED) {
    if (Transition && Transition.running && (Owner as Memo<Init, Next>).pure) {
      if (!(Owner as Memo<Init, Next>).tOwned)
        (Owner as Memo<Init, Next>).tOwned = [c]
      else (Owner as Memo<Init, Next>).tOwned!.push(c)
    } else {
      if (!Owner.owned) Owner.owned = [c]
      else Owner.owned.push(c)
    }
  }

  if (__DEV__ && options && options.name) c.name = options.name

  // if (ExternalSourceConfig && c.fn) {
  //   const [track, trigger] = createSignal<void>(undefined, { equals: false })
  //   const ordinary = ExternalSourceConfig.factory(c.fn, trigger)
  //   // onCleanup(() => ordinary.dispose())
  //   // const triggerInTransition: () => void = () =>
  //   //   startTransition(trigger).then(() => inTransition.dispose())
  //   // const inTransition = ExternalSourceConfig.factory(c.fn, triggerInTransition)
  //   // c.fn = x => {
  //   //   track()
  //   //   return Transition && Transition.running
  //   //     ? inTransition.track(x)
  //   //     : ordinary.track(x)
  //   // }
  // }

  if (__DEV__) DevHooks.afterCreateOwner && DevHooks.afterCreateOwner(c)

  return c
}

function runTop(node: Computation<any>) {
  const runningTransition = Transition && Transition.running
  if ((runningTransition ? node.tState : node.state) === 0) return
  if ((runningTransition ? node.tState : node.state) === PENDING)
    return lookUpstream(node)
  // if (node.suspense && untrack(node.suspense.inFallback!))
  //   return node.suspense.effects!.push(node)
  const ancestors = [node]
  while (
    (node = node.owner as Computation<any>) &&
    (!node.updatedAt || node.updatedAt < ExecCount)
  ) {
    if (runningTransition && Transition!.disposed.has(node)) return
    if (runningTransition ? node.tState : node.state) ancestors.push(node)
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i]
    if (runningTransition) {
      let top = node,
        prev = ancestors[i + 1]
      while ((top = top.owner as Computation<any>) && top !== prev) {
        if (Transition!.disposed.has(top)) return
      }
    }
    if ((runningTransition ? node.tState : node.state) === STALE) {
      updateComputation(node)
    } else if ((runningTransition ? node.tState : node.state) === PENDING) {
      const updates = Updates
      Updates = null
      runUpdates(() => lookUpstream(node, ancestors[0]), false)
      Updates = updates
    }
  }
}

function runUpdates<T>(fn: () => T, init: boolean) {
  if (Updates) return fn()
  let wait = false
  if (!init) Updates = []
  if (Effects) wait = true
  else Effects = []
  ExecCount++
  try {
    const res = fn()
    completeUpdates(wait)
    return res
  } catch (err) {
    if (!wait) Effects = null
    Updates = null
    handleError(err)
  }
}

function completeUpdates(wait: boolean) {
  if (Updates) {
    if (Scheduler && Transition && Transition.running) scheduleQueue(Updates)
    else runQueue(Updates)
    Updates = null
  }
  if (wait) return
  let res
  if (Transition) {
    if (!Transition.promises.size && !Transition.queue.size) {
      // finish transition
      const sources = Transition.sources
      const disposed = Transition.disposed
      Effects!.push.apply(Effects, Transition!.effects)
      res = Transition.resolve
      for (const e of Effects!) {
        'tState' in e && (e.state = e.tState!)
        delete e.tState
      }
      Transition = null
      runUpdates(() => {
        for (const d of disposed) cleanNode(d)
        for (const v of sources) {
          v.value = v.tValue
          if ((v as Memo<any>).owned) {
            for (let i = 0, len = (v as Memo<any>).owned!.length; i < len; i++)
              cleanNode((v as Memo<any>).owned![i])
          }
          if ((v as Memo<any>).tOwned)
            (v as Memo<any>).owned = (v as Memo<any>).tOwned!
          delete v.tValue
          delete (v as Memo<any>).tOwned
          ;(v as Memo<any>).tState = 0
        }
        // setTransPending(false)
      }, false)
    } else if (Transition.running) {
      Transition.running = false
      Transition.effects.push.apply(Transition.effects, Effects!)
      Effects = null
      // setTransPending(true)
      return
    }
  }
  const e = Effects!
  Effects = null
  if (e.length) runUpdates(() => runEffects(e), false)
  else if (__DEV__) DevHooks.afterUpdate && DevHooks.afterUpdate()
  if (res) res()
}

function runQueue(queue: Computation<any>[]) {
  for (let i = 0; i < queue.length; i++) runTop(queue[i])
}

function scheduleQueue(queue: Computation<any>[]) {
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]
    const tasks = Transition!.queue
    if (!tasks.has(item)) {
      tasks.add(item)
      Scheduler!(() => {
        tasks.delete(item)
        runUpdates(() => {
          Transition!.running = true
          runTop(item)
        }, false)
        Transition && (Transition.running = false)
      })
    }
  }
}

function lookUpstream(node: Computation<any>, ignore?: Computation<any>): void {
  const runningTransition = Transition && Transition.running
  if (runningTransition) node.tState = 0
  else node.state = 0
  for (let i = 0; i < node.sources!.length; i += 1) {
    const source = node.sources![i] as Memo<any>
    if (source.sources) {
      const state = runningTransition ? source.tState : source.state
      if (state === STALE) {
        if (
          source !== ignore &&
          (!source.updatedAt || source.updatedAt < ExecCount)
        )
          runTop(source)
      } else if (state === PENDING) lookUpstream(source, ignore)
    }
  }
}

function markDownstream(node: Memo<any>): void {
  const runningTransition = Transition && Transition.running
  for (let i = 0; i < node.observers!.length; i += 1) {
    const o = node.observers![i]
    if (runningTransition ? !o.tState : !o.state) {
      if (runningTransition) o.tState = PENDING
      else o.state = PENDING
      if (o.pure) Updates!.push(o)
      else Effects!.push(o)
      ;(o as Memo<any>).observers && markDownstream(o as Memo<any>)
    }
  }
}

function cleanNode(node: Owner): void {
  let i
  if ((node as Computation<any>).sources) {
    while ((node as Computation<any>).sources!.length) {
      const source = (node as Computation<any>).sources!.pop()!,
        index = (node as Computation<any>).sourceSlots!.pop()!,
        obs = source.observers
      if (obs && obs.length) {
        const n = obs.pop()!,
          s = source.observerSlots!.pop()!
        if (index < obs.length) {
          n.sourceSlots![s] = index
          obs[index] = n
          source.observerSlots![index] = s
        }
      }
    }
  }

  if ((node as Memo<any>).tOwned) {
    for (i = (node as Memo<any>).tOwned!.length - 1; i >= 0; i--)
      cleanNode((node as Memo<any>).tOwned![i])
    delete (node as Memo<any>).tOwned
  }
  if (Transition && Transition.running && (node as Memo<any>).pure) {
    reset(node as Computation<any>, true)
  } else if (node.owned) {
    for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i])
    node.owned = null
  }

  if (node.cleanups) {
    for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]()
    node.cleanups = null
  }
  if (Transition && Transition.running) (node as Computation<any>).tState = 0
  else (node as Computation<any>).state = 0
  __DEV__ && delete node.sourceMap
}

function reset(node: Computation<any>, top?: boolean) {
  if (!top) {
    node.tState = 0
    Transition!.disposed.add(node)
  }
  if (node.owned) {
    for (let i = 0; i < node.owned.length; i++) reset(node.owned[i])
  }
}

function castError(err: unknown): Error {
  if (err instanceof Error) return err
  return new Error(typeof err === 'string' ? err : 'Unknown error')
}

function runErrors(
  err: unknown,
  fns: ((err: any) => void)[],
  owner: Owner | null
) {
  try {
    for (const f of fns) f(err)
  } catch (e) {
    handleError(e, (owner && owner.owner) || null)
  }
}

function handleError(err: unknown, owner = Owner) {
  const fns = ERROR && owner && owner.context && owner.context[ERROR]
  const error = castError(err)
  if (!fns) throw error

  if (Effects)
    Effects.push({
      fn() {
        runErrors(error, fns, owner)
      },
      state: STALE,
    } as unknown as Computation<any>)
  else runErrors(error, fns, owner)
}
