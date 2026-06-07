# @zeus-js/output-react-wrapper (./runtime) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export type EventName<T extends Event = Event> = string & {
  __eventType: T
}
type EventNames = Record<string, EventName | string>
type ElementProps<I extends HTMLElement> = Partial<Omit<I, keyof HTMLElement>>
type ReactRef<I extends HTMLElement> =
  | ((instance: I | null) => void)
  | {
      current: I | null
    }
  | null
export interface ReactModule {
  createElement: (...args: unknown[]) => unknown
  forwardRef: (...args: unknown[]) => unknown
}
type EventListeners<E extends EventNames> = {
  [K in keyof E]?: E[K] extends EventName<infer T>
    ? (event: T) => void
    : (event: Event) => void
}
type ComponentProps<I extends HTMLElement, E extends EventNames> = {
  children?: unknown
  className?: string
  ref?: ReactRef<I>
  style?: unknown
} & {
  [key: string]: unknown
} & EventListeners<E> &
  ElementProps<I>
export type ZeusReactComponent<
  I extends HTMLElement,
  E extends EventNames = {},
> = (props: ComponentProps<I, E>) => unknown
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
