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
 * @zh 创建一个响应式状态
 * @en Create a reactive state
 * @param value - 初始值 / Initial value
 * @param options - 配置选项 / Configuration options
 * @returns 返回一个包含 getter 和 setter 的元组 / Returns a tuple containing getter and setter
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

/**
 * @zh 读取信号值并建立依赖追踪
 * @en Read signal value and establish dependency tracking
 * @param state - 要读取的状态 / The state to read
 * @returns 状态的当前值 / The current value of the state
 */
export function readSignal<T>(state: State<T>): T {
  if (Listener) {
    // 收集依赖 / Collect dependencies
    // 将状态添加到当前计算的sources当中 / Add state to current computation's sources
    const sSlot = state.observers ? state.observers.length : 0
    if (!Listener.sources) {
      Listener.sources = [state]
      Listener.sourceSlots = [sSlot]
    } else {
      Listener.sources.push(state)
      Listener.sourceSlots!.push(sSlot)
    }

    // 将当前计算添加到状态的观察者当中 / Add current computation to state's observers
    // 后面state改变时，会通知当前计算 / When state changes later, it will notify current computation
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

/**
 * @zh 写入信号值并触发依赖更新
 * @en Write signal value and trigger dependency updates
 * @param state - 要更新的状态 / The state to update
 * @param value - 新值 / New value
 * @returns 更新后的值 / Updated value
 */
export function writeSignal<T>(state: State<T> | Memo<T>, value: T): T {
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
            // 递归标记下游依赖为过期 / Recursively mark downstream dependencies as stale
            if ((observer as Memo<any>).observers) {
              markDownstream(observer as Memo<any>)
            }
          }
        }
        if (Updates && Updates.length > 10e5) {
          Updates = []
          if (__DEV__) {
            throw new Error('Updates queue is too long, please check your code')
          } else {
            throw new Error()
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
 * @param fn - 需要运行的函数 / Function to run
 * @param initial - 是否为初始化 / Whether it's initialization
 * @returns 函数的返回值 / Return value of the function
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

/**
 * @zh 完成更新过程
 * @en Complete the update process
 * @param wait - 是否等待 / Whether to wait
 */
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
  for (let i = 0; i < queue.length; i++) {
    runTop(queue[i])
  }
}

/**
 * @zh 运行计算队列中的顶层节点
 * @en Run top-level node in computation queue
 * @param node - 要运行的节点 / Node to run
 */
function runTop<T>(node: Computation<T>) {
  if (node.state === ComputationState.UN) {
    return
  }
  if (node.state === ComputationState.PENDING) {
    return lookUpstream(node)
  }

  // 收集所有需要更新的祖先节点 / Collect all ancestor nodes that need updates
  const ancestors = [node]
  while (
    (node = node.owner as Computation<T>) &&
    (!node.updatedAt || node.updatedAt < ExecCount)
  ) {
    if (node.state) {
      ancestors.push(node)
    }
  }

  // 从最上层的祖先开始更新 / Update starting from the topmost ancestor
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i]
    if (node.state === ComputationState.STALE) {
      updateComputation(node)
    } else if (node.state === ComputationState.PENDING) {
      const updates = Updates
      Updates = null
      runUpdates(() => lookUpstream(node, ancestors[0]), false)
      Updates = updates
    }
  }
}

/**
 * @zh 向上查找并更新依赖
 * @en Look upstream and update dependencies
 * @param node - 当前节点 / Current node
 * @param ignore - 要忽略的节点 / Node to ignore
 */
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

/**
 * @zh 标记下游依赖为过期
 * @en Mark downstream dependencies as stale
 * @param node - 要标记的节点 / The node to mark
 */
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
      // 递归标记观察者的观察者 / Recursively mark observer's observers
      ;(observer as Memo<T>).observers && markDownstream(observer as Memo<T>)
    }
  }
}

/**
 * @zh 创建副作用
 * @en Create an effect
 * @param fn - 副作用函数 / Effect function
 * @param value - 初始值 / Initial value
 */
export function useEffect<T, U>(fn: EffectFunction<T | U, U>, value?: U): void {
  const computation = createComputation(
    fn,
    value!,
    false,
    ComputationState.STALE
  )
  // 如果已有 Effects 队列，添加到队列；否则立即更新 / If Effects queue exists, add to it; otherwise update immediately
  Effects ? Effects.push(computation) : updateComputation(computation)
}

/**
 * @zh 清除节点的依赖关系
 * @en Clear node's dependencies
 * @param node - 要清除的节点 / Node to clear
 */
function clearNode<T>(node: Owner<T>) {
  const _node = node as Computation<T>
  // 清除源依赖 / Clear source dependencies
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

  // 清除拥有的计算 / Clear owned computations
  if (node.owned) {
    for (let i = 0; i < node.owned.length; i++) {
      clearNode(node.owned[i])
    }
    node.owned = null
  }

  // 执行清理函数 / Execute cleanup functions
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

/**
 * @zh 创建计算
 * @en Create a computation
 * @param fn - 计算函数 / Computation function
 * @param value - 初始值 / Initial value
 * @param pure - 是否为纯函数 / Whether it's a pure function
 * @param state - 初始状态 / Initial state
 * @returns 创建的计算 / Created computation
 */
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

  // 将计算添加到当前所有者 / Add computation to current owner
  if (Owner && Owner !== UNOWNED) {
    if (!Owner.owned) {
      Owner.owned = [computation]
    } else {
      Owner.owned.push(computation)
    }
  }

  return computation
}

/**
 * @zh 更新计算
 * @en Update computation
 * @param node - 要更新的节点 / Node to update
 */
function updateComputation<T>(node: Computation<T>) {
  if (!node.fn) return
  clearNode(node)

  // 保存当前上下文 / Save current context
  const owner = Owner
  const listener = Listener
  Listener = Owner = node

  const time = ExecCount
  let nextValue
  try {
    // 执行计算函数 / Execute computation function
    nextValue = node.fn(node.value as T)
  } finally {
    // 恢复上下文 / Restore context
    Listener = listener
    Owner = owner
  }

  // 更新计算结果 / Update computation result
  if (!node.updatedAt || node.updatedAt <= time) {
    node.value = nextValue
    node.updatedAt = time
  }
}

/**
 * @zh 创建记忆化计算
 * @en Create a memoized computation
 * @param fn - 计算函数 / Computation function
 * @returns 记忆化的 getter 函数 / Memoized getter function
 */
export function useMemo<T>(fn: () => T): () => T {
  const computation = createComputation(fn, undefined, true, 0)
  updateComputation(computation)
  return () => {
    // 如果计算过期，重新计算 / If computation is stale, recompute
    if (computation.state === ComputationState.STALE) {
      updateComputation(computation)
    }
    return computation.value as T
  }
}
