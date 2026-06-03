# @zeus-js/zeus (./capabilities) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export declare const ZEUS_CAPABILITIES: {
  readonly packageName: '@zeus-js/zeus'
  readonly version: any
  readonly publicApi: {
    readonly state: true
    readonly computed: true
    readonly effect: true
    readonly watch: true
    readonly scope: true
    readonly batch: true
    readonly untrack: true
    readonly nextTick: true
    readonly onCleanup: true
    readonly render: true
    readonly Show: true
    readonly For: true
    readonly createContext: true
    readonly provide: true
    readonly inject: true
    readonly useContext: true
  }
  readonly jsx: {
    readonly jsxRuntime: true
    readonly jsxDevRuntime: true
    readonly fragment: true
    readonly compiledJsx: true
  }
  readonly webComponents: {
    readonly defineElement: true
    readonly Host: true
    readonly Slot: true
    readonly shadowDom: true
    readonly lightDom: true
    readonly namedSlots: true
    readonly defaultSlot: true
    readonly props: true
    readonly attrs: true
    readonly reflect: true
    readonly events: true
    readonly styles: true
    readonly context: true
  }
  readonly stability: {
    readonly main: 'stable'
    readonly advanced: 'advanced'
    readonly internal: 'private'
  }
}
export type ZeusCapabilities = typeof ZEUS_CAPABILITIES
```
