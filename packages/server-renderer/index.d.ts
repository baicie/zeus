export declare function text(): void
export interface HydrationEventDescriptor {
  name: string
  strategy?: 'delegate' | 'native' | string
  capture?: boolean
  passive?: boolean
  once?: boolean
}
export interface HydrationEventOptions {
  capture: boolean
  passive: boolean
  once: boolean
}
export interface HydrationApplyEntry {
  name: string
  strategy: 'delegate' | 'native'
  status: 'applied'
  options: HydrationEventOptions
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
export interface HydrationApplyContext {
  delegateTarget?: EventTargetLike
  nativeTarget?: EventTargetLike
  fallbackTarget?: EventTargetLike
  eventTargetsByName?: Record<string, EventTargetLike>
  supportsEventListenerOptions?: boolean
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
export declare function ssrHydrationEvents(
  events: Array<string | HydrationEventDescriptor>,
): HydrationEventDescriptor[]
export declare function getSsrHydrationEvents(): HydrationEventDescriptor[]
export declare function clearSsrHydrationEvents(): void
export declare function applyHydrationEvents(
  events: Array<string | HydrationEventDescriptor>,
  context?: HydrationApplyContext,
): HydrationApplyResult
export declare function getHydrationCapabilitySnapshot(
  context?: HydrationApplyContext,
): HydrationCapabilitySnapshot
