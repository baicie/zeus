# @zeus-js/testing (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { JSXValue } from '@zeus-js/zeus'

export interface RenderResult {
  container: HTMLElement
  baseElement: HTMLElement
  dispose: () => void
  unmount: () => void
  rerender: (value: JSXValue | (() => JSXValue)) => void
}
export interface RenderTestOptions {
  container?: HTMLElement
}
/** Mount a Zeus view into an isolated test container. */
export declare function render(
  value: JSXValue | (() => JSXValue),
  options?: RenderTestOptions,
): RenderResult
export type FireEventInit = EventInit & Record<string, unknown>
export declare function fireEvent(element: Element, event: Event): boolean
export declare function fireEvent(
  element: Element,
  type: string,
  init?: FireEventInit,
): boolean
declare namespace fireEvent {
  function click(element: Element, init?: FireEventInit): boolean
  function input(element: Element, init?: FireEventInit): boolean
  function change(element: Element, init?: FireEventInit): boolean
  function submit(element: Element, init?: FireEventInit): boolean
  function focus(element: Element, init?: FireEventInit): boolean
  function blur(element: Element, init?: FireEventInit): boolean
}
/** Let queued microtasks and framework effects settle before assertions. */
export declare function flushEffects(): Promise<void>
export interface RoleQueryOptions {
  name?: string | RegExp
}
/** Find the first element with an explicit or implicit ARIA role. */
export declare function queryByRole(
  container: ParentNode,
  role: string,
  options?: RoleQueryOptions,
): HTMLElement | null
```
