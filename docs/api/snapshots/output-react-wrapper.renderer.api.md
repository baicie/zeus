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
}
export type ReactRenderFunction<Data, Context> = (
  data: Data,
  context: Context,
  session: RendererSession,
) => ReactNode
/**
 * Creates an adapter that renders `render(data, context, session)` into a
 * dedicated React root per container. Mount and update commit synchronously
 * (`flushSync`), so the host sees the rendered DOM when the call returns; do
 * not call them while React itself is rendering.
 */
export declare function createReactRenderer<Data, Context = undefined>(
  render: ReactRenderFunction<Data, Context>,
  options?: ReactRendererOptions,
): RendererAdapter<Element, Data, Context, ReactRendererHandle>
```
