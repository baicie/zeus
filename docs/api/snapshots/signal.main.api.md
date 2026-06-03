# @zeus-js/signal (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

````ts
export interface ValueState<T = unknown> {
  get value(): T
  set value(value: T)
}
type ProxyableInput =
  | Record<PropertyKey, any>
  | readonly any[]
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
export type State<T> = T extends ValueStateInput
  ? ValueState<T>
  : T extends ProxyableInput
    ? Reactive<T>
    : ValueState<T>
type ValueStateInput =
  | null
  | undefined
  | Date
  | RegExp
  | Error
  | Promise<any>
  | Function
  | Node
type Reactive<T extends object> = T
export declare function state<T extends ValueStateInput>(
  value: T,
): ValueState<T>
export declare function state<T extends ProxyableInput>(value: T): Reactive<T>
export declare function state<T>(value: T): ValueState<T>
export declare function state<T = undefined>(): ValueState<T | undefined>
export declare function isValueState<T = unknown>(
  value: unknown,
): value is ValueState<T>

export declare enum TrackOpTypes {
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate',
}
export declare enum TriggerOpTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
}
export declare enum ReactiveFlags {
  SKIP = '__v_skip',
  IS_REACTIVE = '__v_isReactive',
  IS_READONLY = '__v_isReadonly',
  IS_SHALLOW = '__v_isShallow',
  RAW = '__v_raw',
  IS_REF = '__v_isRef',
}

export type EffectScheduler = (...args: any[]) => any
export type DebuggerEvent = {
  effect: Subscriber
} & DebuggerEventExtraInfo
export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}
export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}
export interface ReactiveEffectOptions extends DebuggerOptions {
  scheduler?: EffectScheduler
  allowRecurse?: boolean
  onStop?: () => void
}
export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}
export declare enum EffectFlags {
  /**
   * ReactiveEffect only
   */
  ACTIVE = 1,
  RUNNING = 2,
  TRACKING = 4,
  NOTIFIED = 8,
  DIRTY = 16,
  ALLOW_RECURSE = 32,
  PAUSED = 64,
  EVALUATED = 128,
}
/**
 * Subscriber is a type that tracks (or subscribes to) a list of deps.
 */
interface Subscriber extends DebuggerOptions {}
export declare class ReactiveEffect<T = any>
  implements Subscriber, ReactiveEffectOptions
{
  fn: () => T
  scheduler?: EffectScheduler
  onStop?: () => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  constructor(fn: () => T)
  pause(): void
  resume(): void
  run(): T
  stop(): void
  trigger(): void
  get dirty(): boolean
}
export declare function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner<T>
/**
 * Stops the effect associated with the given runner.
 *
 * @param runner - Association with the effect to stop tracking.
 */
export declare function stop(runner: ReactiveEffectRunner): void
/**
 * Temporarily pauses tracking.
 */
export declare function pauseTracking(): void
/**
 * Re-enables effect tracking (if it was paused).
 */
export declare function enableTracking(): void
/**
 * Resets the previous global effect tracking state.
 */
export declare function resetTracking(): void
/**
 * Registers a cleanup function for the current active effect.
 * The cleanup function is called right before the next effect run, or when the
 * effect is stopped.
 *
 * Throws a warning if there is no current active effect. The warning can be
 * suppressed by passing `true` to the second argument.
 *
 * @param fn - the cleanup function to be registered
 * @param failSilently - if `true`, will not throw warning when called without
 * an active effect.
 */
export declare function onEffectCleanup(
  fn: () => void,
  failSilently?: boolean,
): void
/**
 * Batches reactive updates synchronously within the given function.
 * All updates triggered inside `fn` are deferred until the function completes,
 * then flushed together in a single batch.
 */
export declare function batch<T>(fn: () => T): T
/**
 * Executes the given function without tracking reactive dependencies.
 * Any reactive reads inside `fn` will not trigger effect re-runs.
 */
export declare function untrack<T>(fn: () => T): T
/**
 * Returns the currently executing reactive effect, if any.
 */
export declare function getCurrentEffect(): ReactiveEffect | undefined

declare const RefSymbol: unique symbol
interface Ref<T = any, S = T> {
  get value(): T
  set value(_: S)
  /**
   * Type differentiator only.
   * We need this to be in public d.ts but don't want it to show up in IDE
   * autocomplete, so we use a private Symbol instead.
   */
  [RefSymbol]: true
}

declare const ComputedRefSymbol: unique symbol
declare const WritableComputedRefSymbol: unique symbol
interface BaseComputedRef<T, S = T> extends Ref<T, S> {
  [ComputedRefSymbol]: true
  /**
   * @deprecated computed no longer uses effect
   */
  effect: ComputedRefImpl
}
export interface ComputedRef<T = any> extends BaseComputedRef<T> {
  readonly value: T
}
export interface WritableComputedRef<T, S = T> extends BaseComputedRef<T, S> {
  [WritableComputedRefSymbol]: true
}
export type ComputedGetter<T> = (oldValue?: T) => T
export type ComputedSetter<T> = (newValue: T) => void
export interface WritableComputedOptions<T, S = T> {
  get: ComputedGetter<T>
  set: ComputedSetter<S>
}
/**
 * @private exported by @vue/reactivity for Vue core use, but not exported from
 * the main vue package
 */
export declare class ComputedRefImpl<T = any> implements Subscriber {
  fn: ComputedGetter<T>
  private readonly setter
  effect: this
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  constructor(
    fn: ComputedGetter<T>,
    setter: ComputedSetter<T> | undefined,
    isSSR: boolean,
  )
  get value(): T
  set value(newValue: T)
}
/**
 * Takes a getter function and returns a readonly reactive ref object for the
 * returned value from the getter. It can also take an object with get and set
 * functions to create a writable ref object.
 *
 * @example
 * ```js
 * // Creating a readonly computed ref:
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * console.log(plusOne.value) // 2
 * plusOne.value++ // error
 * ```
 *
 * ```js
 * // Creating a writable computed ref:
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => {
 *     count.value = val - 1
 *   }
 * })
 *
 * plusOne.value = 1
 * console.log(count.value) // 0
 * ```
 *
 * @param getter - Function that produces the next value.
 * @param debugOptions - For debugging. See {@link https://vuejs.org/guide/extras/reactivity-in-depth.html#computed-debugging}.
 * @see {@link https://vuejs.org/api/reactivity-core.html#computed}
 */
export declare function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions,
): ComputedRef<T>
export declare function computed<T, S = T>(
  options: WritableComputedOptions<T, S>,
  debugOptions?: DebuggerOptions,
): WritableComputedRef<T, S>

export declare function queueJob(job: () => void): void
export declare function flushJobs(): void
export declare function nextTick(): Promise<void>

export declare const ITERATE_KEY: unique symbol
export declare const MAP_KEY_ITERATE_KEY: unique symbol
export declare const ARRAY_ITERATE_KEY: unique symbol
/**
 * Tracks access to a reactive property.
 *
 * This will check which effect is running at the moment and record it as dep
 * which records all effects that depend on the reactive property.
 *
 * @param target - Object holding the reactive property.
 * @param type - Defines the type of access to the reactive property.
 * @param key - Identifier of the reactive property to track.
 */
export declare function track(
  target: object,
  type: TrackOpTypes,
  key: unknown,
): void
/**
 * Finds all deps associated with the target (or a specific property) and
 * triggers the effects stored within.
 *
 * @param target - The reactive object.
 * @param type - Defines the type of the operation that needs to trigger effects.
 * @param key - Can be used to target a specific reactive property in the target object.
 */
export declare function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>,
): void

export declare class EffectScope {
  detached: boolean
  private _isPaused
  private _warnOnRun
  readonly __v_skip = true
  constructor(detached?: boolean)
  get active(): boolean
  pause(): void
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume(): void
  run<T>(fn: () => T): T | undefined
  prevScope: EffectScope | undefined
  stop(fromParent?: boolean): void
}
/**
 * Creates an effect scope object which can capture the reactive effects (i.e.
 * computed and watchers) created within it so that these effects can be
 * disposed together. For detailed use cases of this API, please consult its
 * corresponding {@link https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md | RFC}.
 *
 * @param detached - Can be used to create a "detached" effect scope.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export declare function effectScope(detached?: boolean): EffectScope
/**
 * Returns the current active effect scope if there is one.
 *
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export declare function getCurrentScope(): EffectScope | undefined
/**
 * Registers a dispose callback on the current active effect scope. The
 * callback will be invoked when the associated effect scope is stopped.
 *
 * @param fn - The callback function to attach to the scope's cleanup.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
export declare function onScopeDispose(
  fn: () => void,
  failSilently?: boolean,
): void

/**
 * Track array iteration and return:
 * - if input is reactive: a cloned raw array with reactive values
 * - if input is non-reactive or shallowReactive: the original raw array
 */
export declare function reactiveReadArray<T>(array: T[]): T[]
/**
 * Track array iteration and return raw array
 */
export declare function shallowReadArray<T>(arr: T[]): T[]

export declare enum WatchErrorCodes {
  WATCH_GETTER = 2,
  WATCH_CALLBACK = 3,
  WATCH_CLEANUP = 4,
}
export type WatchEffect = (onCleanup: OnCleanup) => void
export type WatchSource<T = any> = Ref<T, any> | ComputedRef<T> | (() => T)
export type WatchCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  onCleanup: OnCleanup,
) => any
export type OnCleanup = (cleanupFn: () => void) => void
export interface WatchOptions<Immediate = boolean> extends DebuggerOptions {
  immediate?: Immediate
  deep?: boolean | number
  once?: boolean
  scheduler?: WatchScheduler
  onWarn?: (msg: string, ...args: any[]) => void
}
export type WatchStopHandle = () => void
export interface WatchHandle extends WatchStopHandle {
  pause: () => void
  resume: () => void
  stop: () => void
}
export type WatchScheduler = (job: () => void, isFirstRun: boolean) => void
/**
 * Returns the current active effect if there is one.
 */
export declare function getCurrentWatcher(): ReactiveEffect<any> | undefined
/**
 * Registers a cleanup callback on the current active effect. This
 * registered cleanup callback will be invoked right before the
 * associated effect re-runs.
 *
 * @param cleanupFn - The callback function to attach to the effect's cleanup.
 * @param failSilently - if `true`, will not throw warning when called without
 * an active effect.
 * @param owner - The effect that this cleanup function should be attached to.
 * By default, the current active effect.
 */
export declare function onWatcherCleanup(
  cleanupFn: () => void,
  failSilently?: boolean,
  owner?: ReactiveEffect | undefined,
): void
export declare function watch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb?: WatchCallback | null,
  options?: WatchOptions,
): WatchHandle
export declare function traverse(
  value: unknown,
  depth?: number,
  seen?: Map<unknown, number>,
): unknown

export declare function onCleanup(fn: () => void): void

export { EffectScope as Scope, effectScope as scope }
````
