# @zeus-js/output-react-wrapper (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

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
   * @default 'auto'
   */
  dts?: DtsMode
  /**
   * Generate react/index.js.
   *
   * @default true
   */
  index?: boolean
  /**
   * Named slot strategy.
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
