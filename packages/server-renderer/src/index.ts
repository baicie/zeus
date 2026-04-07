let _hydrationEvents: HydrationEventDescriptor[] = []
let _supportsEventListenerOptions: boolean | null = null

export function text(): void {}

export interface HydrationEventDescriptor {
  name: string
  strategy?: string
  capture?: boolean
  passive?: boolean
  once?: boolean
}

export interface HydrationApplyEntry {
  name: string
  strategy: 'delegate' | 'native'
  status: 'applied'
  options: HydrationEventOptions
}

export interface HydrationEventOptions {
  capture: boolean
  passive: boolean
  once: boolean
}

export interface HydrationApplyContext {
  delegateTarget?: EventTargetLike
  nativeTarget?: EventTargetLike
  fallbackTarget?: EventTargetLike
  eventTargetsByName?: Record<string, EventTargetLike>
  supportsEventListenerOptions?: boolean
}

export interface EventTargetLike {
  addEventListener(
    type: string,
    listener: (...args: unknown[]) => void,
    options?: unknown,
  ): void
  removeEventListener(
    type: string,
    listener: (...args: unknown[]) => void,
    options?: unknown,
  ): void
}

export interface HydrationApplyHandle {
  dispose(): void
  disposed: boolean
}

export interface HydrationApplyResult {
  applied: HydrationApplyEntry[]
  attached: number
  skipped: number
  deduped: number
  targets: number
  optionFallbackCount: number
  degradedPassive: number
  degradedOnce: number
  capabilitySource: 'manual' | 'auto'
  supportsEventListenerOptions: boolean
  handle: HydrationApplyHandle
}

export interface HydrationCapabilitySnapshot {
  supportsEventListenerOptions: boolean
  source: 'manual' | 'auto'
}

interface AttachedListener {
  key: string
  target: EventTargetLike
  type: string
  listener: (...args: unknown[]) => void
  options: HydrationEventOptions
}

function normalizeStrategy(strategy?: string): 'delegate' | 'native' {
  if (strategy === 'native') {
    return 'native'
  }
  return 'delegate'
}

function resolveDescriptor(
  evt: string | HydrationEventDescriptor,
): HydrationEventDescriptor {
  if (typeof evt === 'string') {
    return { name: evt, strategy: 'delegate' }
  }
  return {
    name: evt.name,
    strategy: normalizeStrategy(evt.strategy),
    capture: evt.capture,
    passive: evt.passive,
    once: evt.once,
  }
}

function resolveEventOptions(
  descriptor: HydrationEventDescriptor,
): HydrationEventOptions {
  return {
    capture: Boolean(descriptor.capture),
    passive: Boolean(descriptor.passive),
    once: Boolean(descriptor.once),
  }
}

function resolveTarget(
  descriptor: HydrationEventDescriptor,
  strategy: 'delegate' | 'native',
  context?: HydrationApplyContext,
): EventTargetLike | undefined {
  if (
    context &&
    context.eventTargetsByName &&
    context.eventTargetsByName[descriptor.name]
  ) {
    return context.eventTargetsByName[descriptor.name]
  }
  if (strategy === 'native') {
    return context && context.nativeTarget
      ? context.nativeTarget
      : context && context.delegateTarget
        ? context.delegateTarget
        : context && context.fallbackTarget
          ? context.fallbackTarget
          : undefined
  }
  return context && context.delegateTarget
    ? context.delegateTarget
    : context && context.fallbackTarget
      ? context.fallbackTarget
      : context && context.nativeTarget
        ? context.nativeTarget
        : undefined
}

function detectEventListenerOptionsSupport(): boolean {
  if (_supportsEventListenerOptions !== null) {
    return _supportsEventListenerOptions
  }
  let supported = false
  const win = (globalThis as { window?: EventTargetLike }).window
  if (win && typeof win.addEventListener === 'function') {
    try {
      const opts: Record<string, unknown> = {}
      Object.defineProperty(opts, 'capture', {
        get() {
          supported = true
          return false
        },
      })
      const listener = () => {}
      win.addEventListener('__zeus_opt_probe__', listener, opts)
      win.removeEventListener('__zeus_opt_probe__', listener)
    } catch (_err) {
      supported = false
    }
  }
  _supportsEventListenerOptions = supported
  return supported
}

function shouldUseOptionsObject(context?: HydrationApplyContext): boolean {
  if (context && typeof context.supportsEventListenerOptions === 'boolean') {
    return context.supportsEventListenerOptions
  }
  return detectEventListenerOptionsSupport()
}

export function getHydrationCapabilitySnapshot(
  context?: HydrationApplyContext,
): HydrationCapabilitySnapshot {
  if (context && typeof context.supportsEventListenerOptions === 'boolean') {
    return {
      supportsEventListenerOptions: context.supportsEventListenerOptions,
      source: 'manual',
    }
  }
  return {
    supportsEventListenerOptions: detectEventListenerOptionsSupport(),
    source: 'auto',
  }
}

export function ssrHydrationEvents(
  events: Array<string | HydrationEventDescriptor>,
): HydrationEventDescriptor[] {
  const seen: Record<string, true> = {}
  const merged: HydrationEventDescriptor[] = _hydrationEvents.slice()
  for (let i = 0; i < merged.length; i++) {
    seen[merged[i].name + ':' + (merged[i].strategy || 'delegate')] = true
  }
  for (let i = 0; i < events.length; i++) {
    const descriptor = resolveDescriptor(events[i])
    const key = descriptor.name + ':' + (descriptor.strategy || 'delegate')
    if (!seen[key]) {
      seen[key] = true
      merged.push(descriptor)
    }
  }
  _hydrationEvents = merged
  return _hydrationEvents.slice()
}

export function getSsrHydrationEvents(): HydrationEventDescriptor[] {
  return _hydrationEvents.slice()
}

export function clearSsrHydrationEvents(): void {
  _hydrationEvents = []
}

export function applyHydrationEvents(
  events: Array<string | HydrationEventDescriptor>,
  context?: HydrationApplyContext,
): HydrationApplyResult {
  const applied: HydrationApplyEntry[] = []
  const attached: AttachedListener[] = []
  const seen: Record<string, true> = {}
  const targetSeen: EventTargetLike[] = []
  let deduped = 0
  let skipped = 0
  let optionFallbackCount = 0
  let degradedPassive = 0
  let degradedOnce = 0
  const useOptionsObject = shouldUseOptionsObject(context)
  const capabilitySource =
    context && typeof context.supportsEventListenerOptions === 'boolean'
      ? 'manual'
      : 'auto'
  let disposed = false
  for (let i = 0; i < events.length; i++) {
    const descriptor = resolveDescriptor(events[i])
    const strategy = normalizeStrategy(descriptor.strategy)
    const options = resolveEventOptions(descriptor)
    const target = resolveTarget(descriptor, strategy, context)
    const key =
      descriptor.name +
      ':' +
      strategy +
      ':' +
      String(target ? target : '') +
      ':' +
      String(options.capture) +
      ':' +
      String(options.passive) +
      ':' +
      String(options.once)
    if (target && !seen[key]) {
      seen[key] = true
      const listener = () => {}
      if (!useOptionsObject) {
        optionFallbackCount++
        if (options.passive) {
          degradedPassive++
        }
        if (options.once) {
          degradedOnce++
        }
        target.addEventListener(descriptor.name, listener, options.capture)
      } else {
        target.addEventListener(descriptor.name, listener, options)
      }
      attached.push({
        key,
        target,
        type: descriptor.name,
        listener,
        options,
      })
      if (targetSeen.indexOf(target) === -1) {
        targetSeen.push(target)
      }
    } else if (target) {
      deduped++
    } else {
      skipped++
    }
    applied.push({
      name: descriptor.name,
      strategy,
      status: 'applied',
      options,
    })
  }
  const handle: HydrationApplyHandle = {
    disposed: false,
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      this.disposed = true
      for (let i = 0; i < attached.length; i++) {
        attached[i].target.removeEventListener(
          attached[i].type,
          attached[i].listener,
          attached[i].options.capture,
        )
      }
    },
  }
  return {
    applied,
    attached: attached.length,
    skipped,
    deduped,
    targets: targetSeen.length,
    optionFallbackCount,
    degradedPassive,
    degradedOnce,
    capabilitySource,
    supportsEventListenerOptions: useOptionsObject,
    handle,
  }
}
