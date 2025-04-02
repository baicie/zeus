/**
 * @zh 计算状态 0: 未执行 1: 已执行 2: 已暂停
 * @en The state of the computation 0: not executed 1: executed 2: paused
 */
enum ComputationState {
  UN = 0,
  STALE = 1,
  PENDING = 2,
}

/**
 * @zh 当前正在执行的计算
 * @en The current computation
 */
let Listener: Computation<any> | null = null

/**
 * @zh 待更新的计算队列
 * @en The queue of computations to be updated
 */
let Updates: Computation<any>[] | null = null

/**
 * @zh 待执行的副作用队列
 * @en The queue of effects to be executed
 */
let Effects: Computation<any>[] | null = null

/**
 * @zh 执行计数器，用于跟踪更新批次
 * @en The execution count, used to track update batches
 */
let ExecCount = 0

let Owner: Owner<any> | null = null

let runEffects = runQueue

const UNOWNED: Owner<unknown> = {
  owned: null,
  cleanups: null,
  owner: null,
  context: null,
}

interface SourceMapValue<T> {
  value: T
  name?: string
  graph?: unknown
}

/**
 * @zh 状态
 * @en State
 */
interface State<T> extends SourceMapValue<T> {
  /**
   * @zh 当前状态的值
   * @en The value of the current state
   */
  value: T
  /**
   * @zh 当前状态的观察者
   * @en The observers of the current state
   */
  observers: Computation<T>[] | null
  /**
   * @zh 当前状态的观察者槽位
   * @en The observer slots of the current state
   */
  observerSlots: number[] | null
  /**
   * @zh 当前状态的比较器
   * @en The comparator of the current state
   */
  comparator?: (prev: T, next: T) => boolean
}

/**
 * @zh 所有者
 * @en The owner
 */
export interface Owner<Prev, Next extends Prev = Prev> {
  /**
   * @zh 当前所有者拥有的计算
   * @en The computations owned by the current owner
   */
  owned: Computation<Prev, Next>[] | null
  /**
   * @zh 当前所有者的清理函数
   * @en The cleanup functions of the current owner
   */
  cleanups: (() => void)[] | null
  /**
   * @zh 当前所有者的所有者
   * @en The owner of the current owner
   */
  owner: Owner<Prev, Next> | null
  /**
   * @zh 当前所有者的上下文
   * @en The context of the current owner
   */
  context: any | null
}

type Source<T> = State<T> | Computation<T>

/**
 * @zh 计算
 * @en The computation
 */
interface Computation<Prev, Next extends Prev = Prev>
  extends Owner<Prev, Next> {
  /**
   * @zh 计算函数
   * @en The computation function
   */
  fn: EffectFunction<Prev, Next>
  /**
   * @zh 计算状态
   * @en The state of the computation
   */
  state: ComputationState
  /**
   * @zh 计算的源
   * @en The sources of the computation
   */
  sources: Source<Prev>[] | null
  /**
   * @zh 计算的源槽位
   * @en The source slots of the computation
   */
  sourceSlots: number[] | null
  /**
   * @zh 计算的值
   * @en The value of the computation
   */
  value?: Prev
  /**
   * @zh 计算的更新时间
   * @en The updated time of the computation
   */
  updatedAt: number | null
  /**
   * @zh 是否为纯函数
   * @en Whether the function is pure
   */
  pure: boolean
}

type EffectFunction<Prev, Next extends Prev = Prev> = (v: Prev) => Next

interface Memo<Prev, Next = Prev> extends State<Next>, Computation<Next> {
  value: Next
  tOwned?: Computation<Prev | Next, Next>[]
}

// type ComputationState = 0 | 1 | 2

export type Getter<T> = () => T

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

export type Signal<T> = [get: Getter<T>, set: Setter<T>]

interface StateOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean)
}
/**
 * @zh 创建状态
 * @en Create a state
 */
export function useState<T>(): Signal<T | undefined>
export function useState<T>(value: T): Signal<T>
export function useState<T>(
  value?: T,
  options?: StateOptions<T | undefined>
): Signal<T | undefined> {
  const state: State<T | undefined> = {
    value,
    observers: null,
    observerSlots: null,
    comparator: (options && options.equals) || undefined,
  }

  const getter: Getter<T | undefined> = () => readSignal<T | undefined>(state)
  const setter = ((value?: T) => {
    if (typeof value === 'function') {
      value = value(state.value)
    }
    return writeSignal<T | undefined>(state, value)
  }) as Setter<T | undefined>

  return [getter, setter]
}

function readSignal<T>(state: State<T>): T {
  if (Listener) {
    // 收集依赖
    // 将状态添加到当前计算的sources当中
    const sSlot = state.observers ? state.observers.length : 0
    if (!Listener.sources) {
      Listener.sources = [state]
      Listener.sourceSlots = [sSlot]
    } else {
      Listener.sources.push(state)
      Listener.sourceSlots!.push(sSlot)
    }

    // 将当前计算添加到状态的观察者当中
    // 后面state改变时，会通知当前计算
    if (!state.observers) {
      state.observers = [Listener]
      state.observerSlots = [Listener.sources.length - 1]
    } else {
      state.observers.push(Listener)
      state.observerSlots!.push(Listener.sources.length - 1)
    }
  }

  return state.value
}

function writeSignal<T>(state: State<T> | Memo<T>, value: T): T {
  if (
    state.comparator
      ? !state.comparator(state.value, value)
      : state.value !== value
  ) {
    state.value = value
    if (state.observers && state.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < state.observers!.length; i++) {
          const observer = state.observers![i]
          if (!observer.state) {
            observer.state = ComputationState.STALE
            if (observer.pure) {
              Updates!.push(observer)
            } else {
              Effects!.push(observer)
            }
            markDownstream(observer as Memo<T>)
          }
        }
      }, false)
    }
  }
  return value
}

/**
 * @zh 运行更新
 * @en Run updates
 * @param fn - 需要运行的函数
 * @param initial - 是否为初始化
 * @returns
 */
function runUpdates(fn: () => void, initial: boolean) {
  if (Updates) {
    return fn()
  }
  let wait = false
  if (!initial) Updates = []
  if (Effects) {
    wait = true
  } else {
    Effects = []
  }

  ExecCount++
  try {
    const result = fn()
    completeUpdates(wait)
    return result
  } catch (e) {
    if (!wait) {
      Effects = null
    }
    Updates = null
    throw e
  }
}

function completeUpdates(wait: boolean) {
  if (Updates) {
    runQueue(Updates)
    Updates = null
  }
  if (wait) return
  const temp = Effects
  Effects = null
  if (temp && temp.length) {
    runUpdates(() => runEffects(temp), false)
  }
}

function runQueue<T>(queue: Computation<T>[]) {
  for (let i = 0; i < queue.length; i++) runTop(queue[i])
}

function runTop<T>(node: Computation<T>) {
  if (node.state === ComputationState.UN) {
    return
  }
  if (node.state === ComputationState.PENDING) {
    return lookUpstream(node)
  }

  const ancestors = [node]
  while (
    (node = node.owner as Computation<T>) &&
    (!node.updatedAt || node.updatedAt < ExecCount)
  ) {
    if (node.state) {
      ancestors.push(node)
    }
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]
    if (ancestor.state === ComputationState.STALE) {
      updateComputation(node)
    } else if (node.state === ComputationState.PENDING) {
      const updates = Updates
      Updates = null
      runUpdates(() => lookUpstream(node, ancestors[0]), false)
      Updates = updates
    }
  }
}

function lookUpstream<T>(node: Computation<T>, ignore?: Computation<T>) {
  node.state = ComputationState.UN
  for (let i = 0; i < node.sources!.length; i++) {
    const source = node.sources![i]
    if ('sources' in source) {
      if (source.state === ComputationState.STALE) {
        if (
          source !== ignore &&
          (!source.updatedAt || source.updatedAt < ExecCount)
        ) {
          runTop(source)
        }
      } else if (source.state === ComputationState.PENDING) {
        lookUpstream(source, ignore)
      }
    }
  }
}

function markDownstream<T>(node: Memo<T>) {
  if (!node.observers) return
  for (let i = 0; i < node.observers.length; i++) {
    const observer = node.observers[i]
    if (!observer.state) {
      observer.state = ComputationState.PENDING
      if (observer.pure) {
        Updates!.push(observer)
      } else {
        Effects!.push(observer)
      }
      ;(observer as Memo<T>).observers && markDownstream(observer as Memo<T>)
    }
  }
}

export function useEffect<T, U>(fn: EffectFunction<T | U, U>, value?: U): void {
  const computation = createComputation(
    fn,
    value!,
    false,
    ComputationState.STALE
  )
  Effects ? Effects.push(computation) : updateComputation(computation)
}

function clearNode<T>(node: Owner<T>) {
  const _node = node as Computation<T>
  if (_node.sources) {
    while (_node.sources.length) {
      const source = _node.sources.pop()
      const sSlot = _node.sourceSlots!.pop() || 0
      if ('observers' in source!) {
        const observer = source.observers
        if (observer && observer.length) {
          const node = observer.pop()
          const sourceIndex = source.observerSlots!.pop()
          if (sSlot < observer.length && node && sourceIndex) {
            node!.sourceSlots![sourceIndex!] = sSlot
            observer[sSlot] = node
            source.observerSlots![sSlot] = sourceIndex
          }
        }
      }
    }
  }
  if (node.owned) {
    for (let i = 0; i < node.owned.length; i++) {
      clearNode(node.owned[i])
    }
    node.owned = null
  }
  if (node.cleanups) {
    for (let i = 0; i < node.cleanups.length; i++) {
      const cleanup = node.cleanups[i]
      cleanup()
    }
    node.cleanups = null
  }

  if ('state' in node) {
    node.state = ComputationState.UN
  }
}

function createComputation<T>(
  fn: EffectFunction<T>,
  value: T,
  pure: boolean,
  state = ComputationState.STALE
) {
  const computation: Computation<T> = {
    fn,
    state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    pure,
    cleanups: null,
    context: Owner ? Owner.context : null,
    owner: Owner,
    value,
  }

  if (Owner && Owner !== UNOWNED) {
    if (!Owner.owned) {
      Owner.owned = [computation]
    } else {
      Owner.owned.push(computation)
    }
  }

  return computation
}

function updateComputation<T>(node: Computation<T>) {
  if (!node.fn) return
  clearNode(node)

  const owner = Owner
  const listener = Listener
  Listener = Owner = node

  const time = ExecCount
  let nextValue
  try {
    nextValue = node.fn(node.value as T)
  } finally {
    Listener = listener
    Owner = owner
  }

  if (!node.updatedAt || node.updatedAt <= time) {
    node.value = nextValue
    node.updatedAt = time
  }
}

export function useMemo<T>(fn: () => T): () => T {
  const computation = createComputation(fn, undefined, true, 0)
  updateComputation(computation)
  return () => {
    if (computation.state === ComputationState.STALE) {
      updateComputation(computation)
    }
    return computation.value as T
  }
}
