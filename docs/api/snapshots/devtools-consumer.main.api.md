# @zeus-js/devtools-consumer (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
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
  | 'component:create'
  | 'component:dispose'
  | 'custom-element:connect'
  | 'custom-element:disconnect'
  | 'effect:run'
  | 'binding:commit'
  | 'binding:cleanup'
  | 'dependency:track'
  | 'dependency:trigger'
  | 'dependency:untrack'
  | 'hmr:patch'
  | 'hmr:invalidate'
  | 'hmr:dispose'
export interface ZeusDevtoolsEvent {
  readonly id: number
  readonly timestamp: number
  readonly type: ZeusDevtoolsEventType
  readonly target?: Node
  readonly targetId?: number
  readonly ownerId?: number
  readonly componentId?: number
  readonly componentName?: string
  readonly bindingId?: number
  readonly effectId?: number
  readonly sourceId?: number
  readonly name?: string
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
export interface ZeusDevtoolsComponentSnapshot {
  readonly id: number
  readonly name: string
  readonly ownerId?: number
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
export interface ZeusDevtoolsCustomElementSnapshot {
  readonly id: number
  readonly name: string
  readonly connected: boolean
  readonly mountCount: number
  readonly disconnectCount: number
  readonly lastEventAt?: number
}
export interface ZeusDevtoolsTimelineEntry {
  readonly id: number
  readonly timestamp: number
  readonly type: ZeusDevtoolsEventType
  readonly targetId?: number
  readonly ownerId?: number
  readonly componentId?: number
  readonly bindingId?: number
  readonly effectId?: number
  readonly sourceId?: number
  readonly name?: string
  readonly reason?: string
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
  readonly components: readonly ZeusDevtoolsComponentSnapshot[]
  readonly effects: readonly ZeusDevtoolsEffectSnapshot[]
  readonly bindings: readonly ZeusDevtoolsBindingSnapshot[]
  readonly sources: readonly ZeusDevtoolsSourceSnapshot[]
  readonly customElements: readonly ZeusDevtoolsCustomElementSnapshot[]
  readonly timeline: readonly ZeusDevtoolsTimelineEntry[]
  readonly selected?: ZeusDevtoolsSelection
}
export interface ZeusDevtoolsConsumerOptions {
  /** Capture click events and expose DOM-to-binding selection. */
  readonly captureClicks?: boolean
  /** Maximum inactive graph entries and timeline entries retained. */
  readonly historyLimit?: number
  readonly onSelect?: (selection: ZeusDevtoolsSelection) => void
}
export interface ZeusDevtoolsPanel {
  getSnapshot(): ZeusDevtoolsSnapshot
  subscribe(listener: (snapshot: ZeusDevtoolsSnapshot) => void): () => void
  selectNode(node: Node): ZeusDevtoolsSelection | undefined
  clearSelection(): void
}
export interface ZeusDevtoolsDomPanelOptions {
  /** Maximum rows rendered in each diagnostic section. */
  readonly rowLimit?: number
  readonly title?: string
}
export interface ZeusDevtoolsDomPanel {
  readonly element: HTMLElement
  disconnect(): void
}
export interface ZeusDevtoolsConsumer extends ZeusDevtoolsPanel {
  readonly hook: ZeusDevtoolsHook
  readonly panel: ZeusDevtoolsPanel
  connect(): void
  disconnect(): void
  consume(event: ZeusDevtoolsEvent): void
}
/**
 * Mounts a visible, same-realm diagnostics panel. The renderer owns only its
 * DOM nodes and subscription; the surrounding consumer keeps its existing
 * lifecycle and click-selection behavior.
 */
export declare function createDevtoolsPanel(
  container: HTMLElement,
  panel: ZeusDevtoolsPanel,
  options?: ZeusDevtoolsDomPanelOptions,
): ZeusDevtoolsDomPanel
/**
 * Minimal MessagePort contract used by the cross-window panel bridge. The
 * structural type keeps the consumer usable with MessageChannel, browser
 * extension ports, and small test doubles without importing DOM globals in
 * the public API.
 */
export interface ZeusDevtoolsMessagePort {
  postMessage(message: unknown): void
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown }) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown }) => void,
  ): void
  start?: () => void
}
export interface ZeusDevtoolsPortEmitter {
  connect(): void
  disconnect(): void
}
export interface ZeusDevtoolsPortConsumer extends ZeusDevtoolsPanel {
  connect(): void
  disconnect(): void
  consume(event: ZeusDevtoolsEvent): void
}
/**
 * Installs a serializing event forwarder on a runtime window. The returned
 * bridge chains through the existing runtime hook and restores it when the
 * panel disconnects. Runtime events never carry DOM references across the
 * port; `targetId` remains available for panel-side lookup protocols.
 */
export declare function createDevtoolsPortEmitter(
  runtimeWindow: Window | undefined,
  port: ZeusDevtoolsMessagePort,
): ZeusDevtoolsPortEmitter
/**
 * Creates a panel consumer backed by a MessagePort. Incoming messages are
 * validated and reduced by the regular panel graph; malformed or unrelated
 * messages are ignored. This API is safe to import in Node/SSR environments.
 */
export declare function createDevtoolsPortConsumer(
  port: ZeusDevtoolsMessagePort,
  options?: ZeusDevtoolsConsumerOptions,
): ZeusDevtoolsPortConsumer
/**
 * Creates a same-realm runtime consumer and panel data model.
 *
 * `targetWindow` is explicit so tests and embedded panels can attach to a
 * chosen document. Calling `connect()` without a window is a no-op, which
 * keeps importing this package safe in SSR and Node tooling.
 */
export declare function createDevtoolsConsumer(
  targetWindow?: Window | undefined,
  options?: ZeusDevtoolsConsumerOptions,
): ZeusDevtoolsConsumer
```
