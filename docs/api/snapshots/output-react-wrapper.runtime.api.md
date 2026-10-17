# @zeus-js/output-react-wrapper (./runtime) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import * as react from 'react'
import { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react'

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
```
