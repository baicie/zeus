# @zeus-js/output-react-wrapper (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'
import * as react from 'react'
import { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react'

type ReactWrapperMode = 'runtime' | 'minimal' | 'event-bridge'
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
   * runtime:
   *   Default. Generates thin proxies powered by @zeus-js/output-react-wrapper/runtime.
   *   Registers during DOM commit and bridges properties, events, and refs.
   *
   * minimal:
   *   Requires React 19+.
   *   React wrapper only renders the custom element tag.
   *   No useEffect prop sync, no event listeners.
   *
   * event-bridge:
   *   Compatibility mode for React 18 or applications that require explicit
   *   CustomEvent bridging and property assignment.
   */
  wrapper?: ReactWrapperMode
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

export type EventName<T extends Event = Event> = string & {
  __eventType: T
}
type EventNames = Record<string, EventName | string>
type PropertyConfig = string[] | Record<string, string | false>
type ElementProps<I extends HTMLElement> = Partial<Omit<I, keyof HTMLElement>>
export type ReactModule = Pick<
  typeof react,
  | 'createElement'
  | 'forwardRef'
  | 'useRef'
  | 'useCallback'
  | 'useEffect'
  | 'useLayoutEffect'
>
type EventListeners<E extends EventNames> = {
  [K in keyof E]?: E[K] extends EventName<infer T>
    ? (event: T) => void
    : (event: Event) => void
}
type ComponentProps<I extends HTMLElement, E extends EventNames> = Omit<
  HTMLAttributes<I>,
  keyof E | keyof ElementProps<I>
> &
  Record<string, unknown> &
  EventListeners<E> &
  ElementProps<I>
export type ZeusReactComponent<
  I extends HTMLElement,
  E extends EventNames = {},
> = ForwardRefExoticComponent<ComponentProps<I, E> & RefAttributes<I>>
export interface ZeusReactCreateComponentOptions<
  I extends HTMLElement,
  E extends EventNames,
> {
  tagName: string
  react: ReactModule
  defineCustomElement?: () => void
  elementClass?: {
    new (): I
  }
  /** Declared properties and optional reflected attribute aliases. */
  props?: PropertyConfig
  events?: E
  slots?: string[]
  displayName?: string
  transformTag?: (tagName: string) => string
}
export declare function createComponent<
  I extends HTMLElement,
  E extends EventNames = {},
>(options: ZeusReactCreateComponentOptions<I, E>): ZeusReactComponent<I, E>

export declare function reactWrapper(
  options?: OutputReactWrapperOptions,
): ZeusComponentPlugin

export { reactWrapper as default }
```
