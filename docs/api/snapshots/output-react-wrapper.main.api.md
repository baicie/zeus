# @zeus-js/output-react-wrapper (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

type ReactWrapperMode = 'minimal' | 'event-bridge'
export interface OutputReactWrapperOptions {
  /**
   * React wrapper output directory.
   *
   * @default 'react'
   */
  outDir?: string
  /**
   * Strip tag prefix for file name.
   *
   * @default false
   */
  stripPrefix?: string | false
  /**
   * Custom file name.
   */
  fileName?: (tag: string) => string
  /**
   * Generate react/index.d.ts.
   *
   * @default true
   */
  dts?: DtsMode
  /**
   * Generate react/index.js.
   *
   * @default true
   */
  index?: boolean
  /**
   * minimal:
   *   Default. Requires React 19+.
   *   React wrapper only renders the custom element tag.
   *   No useEffect prop sync, no event listeners.
   *
   * event-bridge:
   *   Compatibility mode for React 18 or applications that require explicit
   *   CustomEvent bridging and property assignment.
   */
  wrapper?: ReactWrapperMode
  /**
   * Named slot strategy (event-bridge mode only).
   *
   * props:
   *   <ZCard header={<div />} />
   *
   * none:
   *   only children/default slot
   *
   * @default 'props'
   */
  namedSlots?: 'props' | 'none'
}

export declare function reactWrapper(
  options?: OutputReactWrapperOptions,
): ZeusComponentPlugin

export { reactWrapper as default }
```
