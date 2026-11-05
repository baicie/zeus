# @zeus-js/testing (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import {
  RuntimeDiagnosticsSession,
  RuntimeDiagnosticsSnapshot,
} from '@zeus-js/signal/diagnostics'
import { JSXValue, HydrationContext } from '@zeus-js/zeus'
import { renderToString } from '@zeus-js/zeus/server'

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
/** Dispose every render created by this test environment. */
export declare function cleanup(): void
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
export interface WaitForOptions {
  timeout?: number
  interval?: number
}
/** Retry an assertion until it succeeds or the timeout expires. */
export declare function waitFor<T>(
  callback: () => T,
  options?: WaitForOptions,
): Promise<T>
export declare function waitForElement(
  container: ParentNode,
  selector: string,
  options?: WaitForOptions,
): Promise<Element>
export interface UserTypeOptions {
  delay?: number
  skipClick?: boolean
}
export interface UserCompositionOptions {
  updates?: readonly string[]
  end?: string
}
/** Small, DOM-native interaction helpers for component tests. */
export declare const userEvent: {
  click(element: HTMLElement): Promise<void>
  clear(element: HTMLInputElement | HTMLTextAreaElement): Promise<void>
  type(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string,
    options?: UserTypeOptions,
  ): Promise<void>
  keyboard(text: string): Promise<void>
  composition(
    element: HTMLInputElement | HTMLTextAreaElement,
    options?: UserCompositionOptions,
  ): Promise<void>
}
export interface LeakCheck extends RuntimeDiagnosticsSession {
  assertNoLeaks(): Readonly<RuntimeDiagnosticsSnapshot>
}
/** Collect runtime resources and fail if render disposal leaves any alive. */
export declare function startLeakCheck(): LeakCheck
export interface HydratedResult {
  container: HTMLElement
  dispose: () => void
  unmount: () => void
}
/** Server helper kept separate from the DOM render helper for SSR regressions. */
export declare function renderSSR(
  input: Parameters<typeof renderToString>[0],
): string
export declare function hydrateSSR(
  html: string,
  setup: (context: HydrationContext) => void,
  options?: {
    container?: HTMLElement
  },
): HydratedResult
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
