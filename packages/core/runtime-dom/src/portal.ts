import {
  effect,
  getCurrentScope,
  onScopeDispose,
  stop,
} from '@zeus-js/signal/internal'

import { captureScopedSubtreeContext, ScopedSubtree } from './scopedSubtree'

import type { JSXValue } from './types'

export interface PortalProps {
  target: Element | DocumentFragment
  children?: JSXValue | (() => JSXValue)
}

const PORTAL_TARGET_INVALID = 'ZEUS_PORTAL_TARGET_INVALID'
const PORTAL_SCOPE_REQUIRED = 'ZEUS_PORTAL_SCOPE_REQUIRED'

/**
 * Mounts a Native JSX range into a target owned by the same document.
 *
 * The returned comment is the source-tree placeholder. Portal owns only the
 * target anchors and nodes inserted between them.
 */
export function Portal(props: PortalProps): Comment {
  if (!hasActiveScope()) {
    throw new Error(
      `${PORTAL_SCOPE_REQUIRED}: Portal must be rendered inside a scope.`,
    )
  }

  const sourceDocument = getDocument()
  const target = props.target

  assertTarget(target, sourceDocument)

  const source = sourceDocument.createComment('zeus-portal')
  const start = sourceDocument.createComment('zeus-portal-start')
  const end = sourceDocument.createComment('zeus-portal-end')
  target.append(start, end)

  const subtree = new ScopedSubtree(target, end, captureScopedSubtreeContext())
  let runner: ReturnType<typeof effect>
  let disposed = false

  try {
    runner = effect(() => {
      subtree.replace(() => resolveChildren(props.children))
    })
  } catch (error) {
    try {
      subtree.dispose()
    } catch {
      // Preserve the initial render failure.
    } finally {
      start.remove()
      end.remove()
    }
    throw error
  }

  onScopeDispose(() => {
    if (disposed) return
    disposed = true

    let failed = false
    let firstError: unknown
    const release = (callback: () => void): void => {
      try {
        callback()
      } catch (error) {
        if (!failed) {
          failed = true
          firstError = error
        }
      }
    }

    // Portal owns the target anchors. A child cleanup error must not leave
    // them behind in a target the caller still uses.
    release(() => stop(runner))
    release(() => subtree.dispose())
    release(() => start.remove())
    release(() => end.remove())

    if (failed) throw firstError
  }, true)

  return source
}

function resolveChildren(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}

function getDocument(): Document {
  if (typeof document === 'undefined') {
    throw new Error(`${PORTAL_TARGET_INVALID}: Portal requires a DOM document.`)
  }
  return document
}

function assertTarget(
  target: PortalProps['target'],
  sourceDocument: Document,
): asserts target is Element | DocumentFragment {
  const isElement = typeof Element !== 'undefined' && target instanceof Element
  const isFragment =
    typeof DocumentFragment !== 'undefined' &&
    target instanceof DocumentFragment

  if ((!isElement && !isFragment) || target.ownerDocument !== sourceDocument) {
    throw new Error(
      `${PORTAL_TARGET_INVALID}: target must be an Element or DocumentFragment in the current document.`,
    )
  }
}

function hasActiveScope(): boolean {
  return getCurrentScope() !== undefined
}
