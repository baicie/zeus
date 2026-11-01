# @zeus-js/output-vue-wrapper (./renderer) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { RendererSession, RendererAdapter } from '@zeus-js/web-c-runtime'
import { VNodeChild, AppContext } from 'vue'

export interface VueRendererHandle {
  readonly container: Element
  readonly state: 'mounted' | 'disposed'
}
export interface VueRendererOptions {
  /**
   * Application context for the rendered tree, for example `app._context`, so
   * cells resolve the application's components, directives and provides.
   */
  appContext?: AppContext
}
export type VueRenderFunction<Data, Context> = (
  data: Data,
  context: Context,
  session: RendererSession,
) => VNodeChild
/**
 * Creates an adapter that renders `render(data, context, session)` into each
 * container with Vue's `render` API. Mount, update and dispose patch
 * synchronously, and errors from the render function or any descendant are
 * reported to the host instead of Vue's global error handler.
 */
export declare function createVueRenderer<Data, Context = undefined>(
  render: VueRenderFunction<Data, Context>,
  options?: VueRendererOptions,
): RendererAdapter<Element, Data, Context, VueRendererHandle>
```
