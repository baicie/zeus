# @zeus-js/output-react-wrapper (./renderer) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { RendererSession, RendererAdapter } from '@zeus-js/web-c-runtime'
import { ReactNode } from 'react'

export interface ReactRendererHandle {
  readonly container: Element
  readonly state: 'mounted' | 'disposed'
}
export interface ReactRendererOptions {
  /** Render each root inside `<StrictMode>`. */
  strict?: boolean
  /** Prefix for `useId` values, so ids stay unique across many roots. */
  identifierPrefix?: string
  /**
   * Receives errors React 19 reports for a root outside `mount`, `update` and
   * `dispose`, for example from a state update or an effect after the call
   * returned. Errors during those calls are thrown to the host instead.
   * Without this option the error goes to `globalThis.reportError`, or to
   * `console.error` where `reportError` does not exist.
   */
  onError?: (error: unknown, session: RendererSession) => void
}
export type ReactRenderFunction<Data, Context> = (
  data: Data,
  context: Context,
  session: RendererSession,
) => ReactNode
/**
 * Creates an adapter that renders `render(data, context, session)` into a
 * dedicated React root per container. Mount and update commit synchronously
 * (`flushSync`), so the host sees the rendered DOM when the call returns.
 *
 * Call the host's `render`, `setAdapter` and `dispose` (and so this adapter's
 * `mount`, `update` and `dispose`) outside React rendering and commits, for
 * example from an event handler or a scheduled task, not from a React render
 * function, `useLayoutEffect` or `useEffect`. React cannot flush a nested root
 * there; `mount` and `update` then throw `ZEUS_RENDERER_ADAPTER_FAILURE`.
 */
export declare function createReactRenderer<Data, Context = undefined>(
  render: ReactRenderFunction<Data, Context>,
  options?: ReactRendererOptions,
): RendererAdapter<Element, Data, Context, ReactRendererHandle>
```
