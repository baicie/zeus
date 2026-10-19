/**
 * Same-realm consumer for the runtime DevTools event protocol.
 *
 * The runtime intentionally owns the protocol and only emits events in DEV
 * builds. This module is an observer: it keeps a panel-friendly graph and
 * never asks the runtime to change application state.
 */

export type ZeusDevtoolsEventType =
  | 'render'
  | 'effect'
  | 'mount-for'
  | 'delegate-event'
  | 'owner:create'
  | 'owner:dispose'
  | 'effect:run'
  | 'binding:commit'
  | 'binding:cleanup'
  | 'dependency:track'
  | 'dependency:trigger'
  | 'dependency:untrack'

export interface ZeusDevtoolsEvent {
  readonly id: number
  readonly timestamp: number
  readonly type: ZeusDevtoolsEventType
  readonly target?: Node
  readonly targetId?: number
  readonly ownerId?: number
  readonly bindingId?: number
  readonly effectId?: number
  readonly sourceId?: number
  readonly payload?: Readonly<Record<string, unknown>>
}

export interface ZeusDevtoolsHook {
  emit: (event: ZeusDevtoolsEvent) => void
}

export interface ZeusDevtoolsOwnerSnapshot {
  readonly id: number
  readonly parentId?: number
  readonly childIds: readonly number[]
  readonly disposed: boolean
}

export interface ZeusDevtoolsDependencySnapshot {
  readonly sourceId: number
  readonly key: unknown
  readonly operation: unknown
}

export interface ZeusDevtoolsEffectSnapshot {
  readonly id: number
  readonly bindingIds: readonly number[]
  readonly runCount: number
  readonly triggerCount: number
  readonly totalDuration: number
  readonly lastDuration?: number
  readonly lastRunAt?: number
}

export interface ZeusDevtoolsBindingSnapshot {
  readonly id: number
  readonly target?: Node
  readonly targetId?: number
  readonly effectId?: number
  readonly kind?: string
  readonly once: boolean
  readonly commitCount: number
  readonly triggerCount: number
  readonly cleaned: boolean
  readonly totalDuration: number
  readonly lastDuration?: number
  readonly dependencies: readonly ZeusDevtoolsDependencySnapshot[]
}

export interface ZeusDevtoolsSourceSnapshot {
  readonly id: number
  readonly bindingIds: readonly number[]
  readonly trackCount: number
  readonly triggerCount: number
  readonly dependencies: readonly ZeusDevtoolsDependencySnapshot[]
}

export interface ZeusDevtoolsSelection {
  readonly node: Node
  readonly targetId?: number
  readonly bindingIds: readonly number[]
  readonly effectIds: readonly number[]
  readonly sourceIds: readonly number[]
}

export interface ZeusDevtoolsSnapshot {
  readonly revision: number
  readonly eventCount: number
  readonly owners: readonly ZeusDevtoolsOwnerSnapshot[]
  readonly effects: readonly ZeusDevtoolsEffectSnapshot[]
  readonly bindings: readonly ZeusDevtoolsBindingSnapshot[]
  readonly sources: readonly ZeusDevtoolsSourceSnapshot[]
  readonly selected?: ZeusDevtoolsSelection
}

export interface ZeusDevtoolsConsumerOptions {
  /** Capture click events and expose DOM-to-binding selection. */
  readonly captureClicks?: boolean
  /** Maximum inactive diagnostic entries retained per graph category. */
  readonly historyLimit?: number
  readonly onSelect?: (selection: ZeusDevtoolsSelection) => void
}

export interface ZeusDevtoolsPanel {
  getSnapshot(): ZeusDevtoolsSnapshot
  subscribe(listener: (snapshot: ZeusDevtoolsSnapshot) => void): () => void
  selectNode(node: Node): ZeusDevtoolsSelection | undefined
  clearSelection(): void
}

export interface ZeusDevtoolsConsumer extends ZeusDevtoolsPanel {
  readonly hook: ZeusDevtoolsHook
  readonly panel: ZeusDevtoolsPanel
  connect(): void
  disconnect(): void
  consume(event: ZeusDevtoolsEvent): void
}

interface OwnerState {
  id: number
  parentId?: number
  childIds: Set<number>
  disposed: boolean
}

interface DependencyState {
  sourceId: number
  key: unknown
  operation: unknown
}

interface BindingState {
  id: number
  target?: Node
  targetId?: number
  effectId?: number
  kind?: string
  once: boolean
  commitCount: number
  triggerCount: number
  cleaned: boolean
  totalDuration: number
  lastDuration?: number
  dependencies: Map<number, Map<unknown, DependencyState>>
}

interface EffectState {
  id: number
  bindingIds: Set<number>
  activeBindingIds: Set<number>
  runCount: number
  triggerCount: number
  totalDuration: number
  lastDuration?: number
  lastRunAt?: number
}

interface SourceState {
  id: number
  bindingIds: Set<number>
  dependencies: Map<number, Map<unknown, DependencyState>>
  trackCount: number
  triggerCount: number
}

type DevtoolsWindow = Window & {
  __ZEUS_DEVTOOLS_HOOK__?: ZeusDevtoolsHook
}

interface WindowHookState {
  readonly baseHook: ZeusDevtoolsHook | undefined
  readonly baseDescriptor: PropertyDescriptor | undefined
  readonly managerHook: ZeusDevtoolsHook
  readonly consumers: Set<ZeusDevtoolsHook>
}

const windowHookStates = new WeakMap<DevtoolsWindow, WindowHookState>()

/**
 * Creates a same-realm runtime consumer and panel data model.
 *
 * `targetWindow` is explicit so tests and embedded panels can attach to a
 * chosen document. Calling `connect()` without a window is a no-op, which
 * keeps importing this package safe in SSR and Node tooling.
 */
export function createDevtoolsConsumer(
  targetWindow: Window | undefined = typeof window === 'undefined'
    ? undefined
    : window,
  options: ZeusDevtoolsConsumerOptions = {},
): ZeusDevtoolsConsumer {
  const historyLimit = options.historyLimit ?? 500
  if (!Number.isInteger(historyLimit) || historyLimit < 0) {
    throw new RangeError('DevTools historyLimit must be a non-negative integer')
  }
  const owners = new Map<number, OwnerState>()
  const effects = new Map<number, EffectState>()
  const bindings = new Map<number, BindingState>()
  const sources = new Map<number, SourceState>()
  const inactiveOwners = new Map<number, OwnerState>()
  const inactiveEffects = new Map<number, EffectState>()
  const inactiveBindings = new Map<number, BindingState>()
  const inactiveSources = new Map<number, SourceState>()
  const listeners = new Set<(snapshot: ZeusDevtoolsSnapshot) => void>()

  let revision = 0
  let eventCount = 0
  let selected: ZeusDevtoolsSelection | undefined
  let connected = false
  let notificationPending = false
  let windowHookState: WindowHookState | undefined
  const runtimeWindow = targetWindow as DevtoolsWindow | undefined

  const snapshot = (): ZeusDevtoolsSnapshot => ({
    revision,
    eventCount,
    owners: [...owners.values()]
      .sort((left, right) => left.id - right.id)
      .map(owner => ({
        id: owner.id,
        ...(owner.parentId === undefined ? {} : { parentId: owner.parentId }),
        childIds: [...owner.childIds].sort((left, right) => left - right),
        disposed: owner.disposed,
      })),
    effects: [...effects.values()]
      .sort((left, right) => left.id - right.id)
      .map(effect => ({
        id: effect.id,
        bindingIds: [...effect.bindingIds].sort((left, right) => left - right),
        runCount: effect.runCount,
        triggerCount: effect.triggerCount,
        totalDuration: effect.totalDuration,
        ...(effect.lastDuration === undefined
          ? {}
          : { lastDuration: effect.lastDuration }),
        ...(effect.lastRunAt === undefined
          ? {}
          : { lastRunAt: effect.lastRunAt }),
      })),
    bindings: [...bindings.values()]
      .sort((left, right) => left.id - right.id)
      .map(binding => ({
        id: binding.id,
        ...(binding.target === undefined ? {} : { target: binding.target }),
        ...(binding.targetId === undefined
          ? {}
          : { targetId: binding.targetId }),
        ...(binding.effectId === undefined
          ? {}
          : { effectId: binding.effectId }),
        ...(binding.kind === undefined ? {} : { kind: binding.kind }),
        once: binding.once,
        commitCount: binding.commitCount,
        triggerCount: binding.triggerCount,
        cleaned: binding.cleaned,
        totalDuration: binding.totalDuration,
        ...(binding.lastDuration === undefined
          ? {}
          : { lastDuration: binding.lastDuration }),
        dependencies: dependencyValues(binding.dependencies),
      })),
    sources: [...sources.values()]
      .sort((left, right) => left.id - right.id)
      .map(source => ({
        id: source.id,
        bindingIds: [...source.bindingIds].sort((left, right) => left - right),
        trackCount: source.trackCount,
        triggerCount: source.triggerCount,
        dependencies: dependencyValues(source.dependencies),
      })),
    ...(selected === undefined ? {} : { selected }),
  })

  const notify = (): void => {
    if (listeners.size === 0 || notificationPending) return
    notificationPending = true
    queueMicrotask(() => {
      notificationPending = false
      if (listeners.size === 0) return
      const next = snapshot()
      for (const listener of [...listeners]) {
        try {
          listener(next)
        } catch {
          // A panel is an observer and must not break runtime updates.
        }
      }
    })
  }

  const consume = (event: ZeusDevtoolsEvent): void => {
    eventCount++
    const changed = reduceEvent(event)
    if (!changed) return
    revision++
    notify()
  }

  const hook: ZeusDevtoolsHook = {
    emit(event) {
      consume(event)
    },
  }

  const selectNode = (
    node: Node,
    notifySelection = true,
  ): ZeusDevtoolsSelection | undefined => {
    const selectedBindings = [...bindings.values()].filter(binding => {
      if (binding.cleaned || binding.target === undefined) return false
      return isBindingForNode(binding.target, node)
    })

    if (selectedBindings.length === 0) {
      if (notifySelection) {
        selected = undefined
        revision++
        notify()
      }
      return undefined
    }

    const bindingIds = selectedBindings
      .map(binding => binding.id)
      .sort((left, right) => left - right)
    const effectIds = uniqueSorted(
      selectedBindings
        .map(binding => binding.effectId)
        .filter((id): id is number => id !== undefined),
    )
    const sourceIds = uniqueSorted(
      selectedBindings.flatMap(binding =>
        [...binding.dependencies.values()].flatMap(dependencies =>
          [...dependencies.values()].map(dependency => dependency.sourceId),
        ),
      ),
    )
    const targetId = selectedBindings.find(
      binding => binding.target === node,
    )?.targetId

    const selection: ZeusDevtoolsSelection = {
      node,
      ...(targetId === undefined ? {} : { targetId }),
      bindingIds,
      effectIds,
      sourceIds,
    }
    if (notifySelection) {
      selected = selection
      revision++
      notify()
      try {
        options.onSelect?.(selection)
      } catch {
        // A panel callback is also an observer.
      }
    }
    return selection
  }

  const clearSelection = (): void => {
    if (selected === undefined) return
    selected = undefined
    revision++
    notify()
  }

  const panel: ZeusDevtoolsPanel = {
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener)
      try {
        listener(snapshot())
      } catch {
        // Initial delivery follows the same observer isolation as updates.
      }
      return () => listeners.delete(listener)
    },
    selectNode,
    clearSelection,
  }

  const clickListener = (event: Event): void => {
    const path = event.composedPath?.() ?? []
    const nodes = path.filter(isNode)
    if (nodes.length === 0 && event.target && isNode(event.target)) {
      nodes.push(event.target)
    }

    const selections = nodes
      .map(node => selectNode(node, false))
      .filter(
        (selection): selection is ZeusDevtoolsSelection =>
          selection !== undefined,
      )
    const selection = mergeSelections(selections)
    if (!selection) return
    selected = selection
    revision++
    notify()
    try {
      options.onSelect?.(selection)
    } catch {
      // A panel callback is also an observer.
    }
  }

  const connect = (): void => {
    if (connected || !targetWindow) return
    let nextHookState: WindowHookState | undefined
    try {
      if (runtimeWindow) {
        nextHookState = getOrCreateWindowHookState(runtimeWindow)
        nextHookState.consumers.add(hook)
      }
      if (options.captureClicks !== false) {
        targetWindow.document.addEventListener('click', clickListener, true)
      }
      windowHookState = nextHookState
      connected = true
    } catch (error) {
      if (runtimeWindow && nextHookState) {
        releaseWindowHook(runtimeWindow, nextHookState, hook)
      }
      throw error
    }
  }

  const disconnect = (): void => {
    if (!connected) return
    connected = false
    if (targetWindow && options.captureClicks !== false) {
      targetWindow.document.removeEventListener('click', clickListener, true)
    }
    if (runtimeWindow && windowHookState) {
      releaseWindowHook(runtimeWindow, windowHookState, hook)
    }
    windowHookState = undefined
  }

  return {
    ...panel,
    hook,
    panel,
    connect,
    disconnect,
    consume,
  }

  function reduceEvent(event: ZeusDevtoolsEvent): boolean {
    switch (event.type) {
      case 'owner:create': {
        if (event.ownerId === undefined) return false
        const owner = owners.get(event.ownerId) ?? {
          id: event.ownerId,
          childIds: new Set<number>(),
          disposed: false,
        }
        const parentId = numberPayload(event.payload, 'parentId')
        if (parentId !== undefined && owner.parentId !== parentId) {
          if (owner.parentId !== undefined) {
            owners.get(owner.parentId)?.childIds.delete(owner.id)
          }
          owner.parentId = parentId
          const parent = owners.get(parentId) ?? {
            id: parentId,
            childIds: new Set<number>(),
            disposed: false,
          }
          parent.childIds.add(owner.id)
          owners.set(parentId, parent)
        }
        owner.disposed = false
        inactiveOwners.delete(owner.id)
        owners.set(owner.id, owner)
        return true
      }
      case 'owner:dispose': {
        if (event.ownerId === undefined) return false
        const owner = owners.get(event.ownerId) ?? {
          id: event.ownerId,
          childIds: new Set<number>(),
          disposed: false,
        }
        owners.set(owner.id, owner)
        const pending = [owner]
        const visited = new Set<number>()
        while (pending.length > 0) {
          const current = pending.pop()!
          if (visited.has(current.id)) continue
          visited.add(current.id)
          for (const childId of current.childIds) {
            const child = owners.get(childId)
            if (child) pending.push(child)
          }
          current.disposed = true
          retainInactive(owners, inactiveOwners, current, removed => {
            if (removed.parentId !== undefined) {
              owners.get(removed.parentId)?.childIds.delete(removed.id)
            }
          })
        }
        return true
      }
      case 'effect:run': {
        if (event.effectId === undefined) return false
        const effect = ensureEffect(event.effectId)
        inactiveEffects.delete(effect.id)
        const duration = numberPayload(event.payload, 'duration') ?? 0
        effect.runCount++
        effect.totalDuration += duration
        effect.lastDuration = duration
        effect.lastRunAt = event.timestamp
        return true
      }
      case 'binding:commit': {
        if (event.bindingId === undefined) return false
        const binding = ensureBinding(event.bindingId)
        binding.cleaned = false
        inactiveBindings.delete(binding.id)
        binding.target = event.target ?? binding.target
        binding.targetId = event.targetId ?? binding.targetId
        binding.effectId = event.effectId ?? binding.effectId
        binding.kind = stringPayload(event.payload, 'kind') ?? binding.kind
        binding.once = booleanPayload(event.payload, 'once') ?? binding.once
        binding.commitCount++
        const commitDuration = numberPayload(event.payload, 'duration')
        if (commitDuration !== undefined) {
          binding.lastDuration = commitDuration
          binding.totalDuration += commitDuration
        }
        if (binding.effectId !== undefined) {
          const effect = ensureEffect(binding.effectId)
          effect.bindingIds.add(binding.id)
          effect.activeBindingIds.add(binding.id)
          inactiveEffects.delete(effect.id)
        }
        return true
      }
      case 'binding:cleanup': {
        if (event.bindingId === undefined) return false
        const binding = ensureBinding(event.bindingId)
        binding.cleaned = true
        const target = event.target ?? binding.target
        if (
          selected &&
          (selected.node === target || selected.bindingIds.includes(binding.id))
        ) {
          selected = undefined
        }
        binding.target = undefined
        binding.targetId = event.targetId ?? binding.targetId
        binding.effectId = event.effectId ?? binding.effectId
        clearBindingDependencies(binding)
        if (binding.effectId !== undefined) {
          const effect = ensureEffect(binding.effectId)
          effect.bindingIds.add(binding.id)
          effect.activeBindingIds.delete(binding.id)
          if (effect.activeBindingIds.size === 0) {
            retainInactive(effects, inactiveEffects, effect)
          }
        }
        retainInactive(bindings, inactiveBindings, binding, removed => {
          if (removed.effectId !== undefined) {
            effects.get(removed.effectId)?.bindingIds.delete(removed.id)
          }
        })
        return true
      }
      case 'dependency:track':
        return updateDependency(event, 'track')
      case 'dependency:untrack':
        return updateDependency(event, 'untrack')
      case 'dependency:trigger': {
        if (event.sourceId === undefined) return false
        const source = ensureSource(event.sourceId)
        source.triggerCount++
        if (source.bindingIds.size === 0) {
          retainInactive(sources, inactiveSources, source)
        }
        if (event.bindingId !== undefined) {
          const binding = ensureBinding(event.bindingId)
          binding.triggerCount++
        }
        if (event.effectId !== undefined)
          ensureEffect(event.effectId).triggerCount++
        return true
      }
      default:
        return false
    }
  }

  function updateDependency(
    event: ZeusDevtoolsEvent,
    operation: 'track' | 'untrack',
  ): boolean {
    if (
      event.bindingId === undefined ||
      event.sourceId === undefined ||
      !event.payload
    ) {
      return false
    }
    const binding = ensureBinding(event.bindingId)
    const source = ensureSource(event.sourceId)
    const key = event.payload.key
    const dependency: DependencyState = {
      sourceId: event.sourceId,
      key,
      operation: event.payload.operation,
    }
    let sourceKeys = binding.dependencies.get(event.sourceId)
    if (!sourceKeys) {
      sourceKeys = new Map()
      binding.dependencies.set(event.sourceId, sourceKeys)
    }
    if (operation === 'track') {
      inactiveSources.delete(source.id)
      sourceKeys.set(key, dependency)
      source.bindingIds.add(binding.id)
      let sourceKeysByBinding = source.dependencies.get(binding.id)
      if (!sourceKeysByBinding) {
        sourceKeysByBinding = new Map()
        source.dependencies.set(binding.id, sourceKeysByBinding)
      }
      sourceKeysByBinding.set(key, dependency)
      source.trackCount++
    } else {
      sourceKeys.delete(key)
      if (sourceKeys.size === 0) binding.dependencies.delete(event.sourceId)
      const sourceKeysByBinding = source.dependencies.get(binding.id)
      sourceKeysByBinding?.delete(key)
      if (sourceKeysByBinding?.size === 0) {
        source.dependencies.delete(binding.id)
        source.bindingIds.delete(binding.id)
      }
      if (source.bindingIds.size === 0) {
        retainInactive(sources, inactiveSources, source)
      }
    }
    return true
  }

  function ensureEffect(id: number): EffectState {
    let effect = effects.get(id)
    if (!effect) {
      effect = {
        id,
        bindingIds: new Set(),
        activeBindingIds: new Set(),
        runCount: 0,
        triggerCount: 0,
        totalDuration: 0,
      }
      effects.set(id, effect)
    }
    return effect
  }

  function ensureBinding(id: number): BindingState {
    let binding = bindings.get(id)
    if (!binding) {
      binding = {
        id,
        once: false,
        commitCount: 0,
        triggerCount: 0,
        cleaned: false,
        totalDuration: 0,
        dependencies: new Map(),
      }
      bindings.set(id, binding)
    }
    return binding
  }

  function ensureSource(id: number): SourceState {
    let source = sources.get(id)
    if (!source) {
      source = {
        id,
        bindingIds: new Set(),
        dependencies: new Map(),
        trackCount: 0,
        triggerCount: 0,
      }
      sources.set(id, source)
    }
    return source
  }

  function clearBindingDependencies(binding: BindingState): void {
    for (const sourceId of binding.dependencies.keys()) {
      const source = sources.get(sourceId)
      if (source) {
        source.dependencies.delete(binding.id)
        source.bindingIds.delete(binding.id)
        if (source.bindingIds.size === 0) {
          retainInactive(sources, inactiveSources, source)
        }
      }
    }
    binding.dependencies.clear()
  }

  function retainInactive<T extends { id: number }>(
    entries: Map<number, T>,
    history: Map<number, T>,
    entry: T,
    onEvict?: (entry: T) => void,
  ): void {
    history.delete(entry.id)
    history.set(entry.id, entry)
    while (history.size > historyLimit) {
      const oldest = history.values().next().value as T
      history.delete(oldest.id)
      entries.delete(oldest.id)
      onEvict?.(oldest)
    }
  }
}

function dependencyValues(
  dependencies: Map<number, Map<unknown, DependencyState>>,
): ZeusDevtoolsDependencySnapshot[] {
  return [...dependencies.values()]
    .flatMap(entries => [...entries.values()])
    .map(dependency => ({ ...dependency }))
}

function getOrCreateWindowHookState(
  runtimeWindow: DevtoolsWindow,
): WindowHookState {
  const existing = windowHookStates.get(runtimeWindow)
  if (existing) return existing

  const baseHook = runtimeWindow.__ZEUS_DEVTOOLS_HOOK__
  const baseDescriptor = Object.getOwnPropertyDescriptor(
    runtimeWindow,
    '__ZEUS_DEVTOOLS_HOOK__',
  )
  const consumers = new Set<ZeusDevtoolsHook>()
  let state!: WindowHookState
  const managerHook: ZeusDevtoolsHook = {
    emit(event) {
      try {
        baseHook?.emit(event)
      } catch {
        // A broken observer must not block other consumers.
      }
      for (const consumer of [...consumers]) {
        try {
          consumer.emit(event)
        } catch {
          // A broken panel must not block runtime updates or sibling panels.
        }
      }
    },
  }

  installWindowHook(runtimeWindow, baseDescriptor, managerHook)
  state = { baseHook, baseDescriptor, managerHook, consumers }
  windowHookStates.set(runtimeWindow, state)
  return state
}

function restoreWindowHook(
  runtimeWindow: DevtoolsWindow,
  state: WindowHookState,
): void {
  if (state.baseDescriptor) {
    if ('value' in state.baseDescriptor) {
      Object.defineProperty(runtimeWindow, '__ZEUS_DEVTOOLS_HOOK__', {
        ...state.baseDescriptor,
        value: state.baseHook,
      })
    } else {
      Object.defineProperty(
        runtimeWindow,
        '__ZEUS_DEVTOOLS_HOOK__',
        state.baseDescriptor,
      )
    }
  } else {
    delete runtimeWindow.__ZEUS_DEVTOOLS_HOOK__
  }
}

function releaseWindowHook(
  runtimeWindow: DevtoolsWindow,
  state: WindowHookState,
  hook: ZeusDevtoolsHook,
): void {
  state.consumers.delete(hook)
  if (state.consumers.size > 0) return
  if (runtimeWindow.__ZEUS_DEVTOOLS_HOOK__ === state.managerHook) {
    restoreWindowHook(runtimeWindow, state)
  }
  windowHookStates.delete(runtimeWindow)
}

function installWindowHook(
  runtimeWindow: DevtoolsWindow,
  descriptor: PropertyDescriptor | undefined,
  hook: ZeusDevtoolsHook,
): void {
  if (descriptor && !('value' in descriptor)) {
    if (!descriptor.configurable) {
      throw new TypeError(
        'Cannot attach Zeus DevTools consumer to a non-configurable hook accessor',
      )
    }
    Object.defineProperty(runtimeWindow, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: true,
      enumerable: descriptor.enumerable,
      writable: true,
      value: hook,
    })
    return
  }

  Object.defineProperty(runtimeWindow, '__ZEUS_DEVTOOLS_HOOK__', {
    ...(descriptor ?? {
      configurable: true,
      enumerable: false,
      writable: true,
    }),
    value: hook,
  })
}

function mergeSelections(
  selections: readonly ZeusDevtoolsSelection[],
): ZeusDevtoolsSelection | undefined {
  const first = selections[0]
  if (!first) return undefined
  const targetId = selections.find(
    selection => selection.targetId !== undefined,
  )?.targetId

  return {
    node: first.node,
    ...(targetId === undefined ? {} : { targetId }),
    bindingIds: uniqueSorted(
      selections.flatMap(selection => selection.bindingIds),
    ),
    effectIds: uniqueSorted(
      selections.flatMap(selection => selection.effectIds),
    ),
    sourceIds: uniqueSorted(
      selections.flatMap(selection => selection.sourceIds),
    ),
  }
}

function numberPayload(
  payload: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number | undefined {
  const value = payload?.[key]
  return typeof value === 'number' ? value : undefined
}

function stringPayload(
  payload: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = payload?.[key]
  return typeof value === 'string' ? value : undefined
}

function booleanPayload(
  payload: Readonly<Record<string, unknown>> | undefined,
  key: string,
): boolean | undefined {
  const value = payload?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Node).nodeType === 'number'
  )
}

function isBindingForNode(target: Node, node: Node): boolean {
  if (target === node) return true
  // A click targets an element, while a text binding targets its Text child.
  return target.nodeType === 3 && target.parentNode === node
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right)
}
