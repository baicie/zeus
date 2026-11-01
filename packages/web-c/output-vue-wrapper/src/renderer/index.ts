// Vue Framework Renderer Adapter (RFC-011). VNodes, component instances,
// provide/inject and Teleport are interpreted only here; the Web Component
// runtime and the renderer host only see the container and the opaque handle.
import { defineComponent, h, render as renderVNode } from 'vue'

import type {
  RendererAdapter,
  RendererErrorCode,
  RendererSession,
} from '@zeus-js/web-c-runtime'
import type { AppContext, PropType, VNodeChild } from 'vue'

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

interface MountedTree {
  container: Element
  session: RendererSession
  failure: { error: unknown } | undefined
}

/**
 * Creates an adapter that renders `render(data, context, session)` into each
 * container with Vue's `render` API. Mount, update and dispose patch
 * synchronously, and errors from the render function or any descendant are
 * reported to the host instead of Vue's global error handler.
 */
export function createVueRenderer<Data, Context = undefined>(
  render: VueRenderFunction<Data, Context>,
  options: VueRendererOptions = {},
): RendererAdapter<Element, Data, Context, VueRendererHandle> {
  const trees = new WeakMap<VueRendererHandle, MountedTree>()
  const disposed = new WeakSet<VueRendererHandle>()

  const Root = defineComponent({
    name: 'ZeusRendererRoot',
    props: {
      data: { type: null as unknown as PropType<Data>, required: true },
      context: { type: null as unknown as PropType<Context>, required: true },
      tree: { type: Object as PropType<MountedTree>, required: true },
    },
    errorCaptured(error) {
      this.tree.failure ??= { error }
      return false
    },
    render() {
      try {
        return render(this.data, this.context, this.tree.session)
      } catch (error) {
        this.tree.failure ??= { error }
        return null
      }
    },
  })

  function patch(tree: MountedTree, data: Data, context: Context): void {
    tree.failure = undefined
    const vnode = h(Root, { data, context, tree })
    if (options.appContext) vnode.appContext = options.appContext
    renderVNode(vnode, tree.container)
    // The synchronous patch may record a failure through the root component.
    const failure = tree.failure as MountedTree['failure']
    if (failure) {
      throw rendererError(
        'ZEUS_RENDERER_ADAPTER_FAILURE',
        `Vue renderer failed for key ${String(tree.session.key)}.`,
        failure.error,
      )
    }
  }

  function lookup(handle: VueRendererHandle, phase: string): MountedTree {
    const tree = trees.get(handle)
    if (tree && tree.container === handle.container) return tree
    if (disposed.has(handle)) {
      throw rendererError(
        'ZEUS_RENDERER_DISPOSED',
        `Cannot ${phase} a Vue renderer handle after it was disposed.`,
      )
    }
    throw rendererError(
      'ZEUS_RENDERER_CONTAINER_MISMATCH',
      `Cannot ${phase} a handle that this Vue renderer did not mount.`,
    )
  }

  return {
    mount(container, data, context, session) {
      const tree: MountedTree = { container, session, failure: undefined }
      try {
        patch(tree, data, context)
      } catch (error) {
        renderVNode(null, container)
        throw error
      }
      const handle = { container, state: 'mounted' as const }
      trees.set(handle, tree)
      return handle
    },

    update(handle, data, context) {
      patch(lookup(handle, 'update'), data, context)
    },

    dispose(handle) {
      if (disposed.has(handle)) return
      const tree = lookup(handle, 'dispose')
      trees.delete(handle)
      disposed.add(handle)
      ;(handle as { state: VueRendererHandle['state'] }).state = 'disposed'
      renderVNode(null, tree.container)
    },
  }
}

// Mirrors `createRendererError` without a runtime import, so this entry only
// depends on @zeus-js/web-c-runtime for types.
function rendererError(
  code: RendererErrorCode,
  message: string,
  cause?: unknown,
): Error {
  const error = new Error(`[${code}] ${message}`) as Error & { cause?: unknown }
  if (cause !== undefined) error.cause = cause
  return error
}
