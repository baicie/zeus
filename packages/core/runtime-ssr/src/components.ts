// packages/core/runtime-ssr/src/components.ts
//
// Server semantics for the two DOM-positioning components that the compiler
// does not treat as intrinsics. Both exist so an SSR-compiled module can
// import them from the SSR facade instead of pulling the DOM runtime into
// Node.

import { assertSyncSSRValue } from './serialize'

import type { SSRNode } from './types'

export interface SSRPortalProps extends Record<string, unknown> {
  /** Client-only portal target; ignored during server rendering. */
  target?: unknown
  children?: SSRNode | (() => SSRNode)
}

/**
 * A portal has no server-side position: there is no live DOM target to move
 * nodes into. The server renders its children inline at the source position,
 * and the client takes over the real placement after upgrade. This mirrors the
 * behavior of React's `createPortal` under `renderToString`.
 */
export function Portal(props: SSRPortalProps): SSRNode {
  return resolveValue(props.children)
}

export interface SSRTransitionProps extends Record<string, unknown> {
  when?: unknown
  children?: SSRNode | (() => SSRNode)
  fallback?: SSRNode | (() => SSRNode)
}

/**
 * SSR has no animation lifecycle. The server serializes the same branch the
 * client shows initially, matching the compiler's `<Transition>` lowering.
 */
export function Transition(props: SSRTransitionProps): SSRNode {
  assertSyncSSRValue(props.when)
  const value = props.when ? props.children : props.fallback
  return resolveValue(value)
}

function resolveValue(value: SSRNode | (() => SSRNode) | undefined): SSRNode {
  return typeof value === 'function' ? value() : (value ?? null)
}
