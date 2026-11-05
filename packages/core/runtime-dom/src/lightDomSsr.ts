// packages/runtime-dom/src/lightDomSsr.ts
//
// Client-side consumption of the Light DOM markers emitted by
// `@zeus-js/runtime-ssr` for `defineElement(..., { shadow: false })`.
//
// The server writes two comment pairs:
//
//   <!--zeus:light:root-->  ... internal content ...  <!--/zeus:light:root-->
//   <!--zeus:light:child--> ... one projected consumer node ... <!--/zeus:light:child-->
//
// Only these explicit markers separate server-rendered internal structure from
// consumer children. Without them the host keeps the previous behavior: every
// existing child is an unknown consumer child and the element mounts fresh.

import {
  LIGHT_DOM_CHILD_END_MARKER,
  LIGHT_DOM_CHILD_MARKER,
  LIGHT_DOM_ROOT_END_MARKER,
  LIGHT_DOM_ROOT_MARKER,
} from '@zeus-js/shared'

const COMMENT_NODE = 8

/**
 * Returns the consumer children recorded by the server, or `undefined` when
 * the host carries no SSR Light DOM markers.
 *
 * Marked consumer nodes are detached, and the server-rendered internal content
 * (including its marker comments) is removed because the client mounts a fresh
 * tree. `undefined` means "not an SSR Light DOM host", so the caller keeps its
 * existing capture behavior.
 */
export function takeSSRLightDomChildren(host: HTMLElement): Node[] | undefined {
  const root = findRootBlock(host)
  if (!root) return undefined

  const children: Node[] = []
  let node: Node | null = root.start.nextSibling

  while (node && node !== root.end) {
    node = collectAt(node, children)
  }

  removeRange(root.start, root.end)
  return children
}

interface SSRLightRootBlock {
  readonly start: Comment
  readonly end: Comment
}

function findRootBlock(host: HTMLElement): SSRLightRootBlock | undefined {
  let start: Comment | undefined
  let node = host.firstChild

  while (node) {
    if (commentData(node) === LIGHT_DOM_ROOT_MARKER && !start) {
      start = node as Comment
    } else if (start && commentData(node) === LIGHT_DOM_ROOT_END_MARKER) {
      return { start, end: node as Comment }
    }
    node = node.nextSibling
  }

  return undefined
}

/**
 * Consumes one node at the current walk position and returns the next node to
 * visit.
 *
 * Returning the next node instead of reading `node.nextSibling` afterwards is
 * required: consuming a child payload detaches the payload and its markers,
 * which would otherwise clear the sibling link and skip the following
 * `zeus:light:child` block.
 */
function collectAt(node: Node, children: Node[]): Node | null {
  if (commentData(node) === LIGHT_DOM_CHILD_MARKER) {
    return collectChildPayload(node as Comment, children)
  }

  // A projected consumer child may itself be an SSR Light DOM host. Its own
  // markers belong to that element's upgrade, so the subtree stays opaque.
  if (containsRootMarker(node)) return node.nextSibling

  let child: Node | null = node.firstChild
  while (child) {
    child = collectAt(child, children)
  }

  return node.nextSibling
}

function collectChildPayload(marker: Comment, children: Node[]): Node | null {
  const payload: Node[] = []
  let node: Node | null = marker.nextSibling

  while (node && commentData(node) !== LIGHT_DOM_CHILD_END_MARKER) {
    payload.push(node)
    node = node.nextSibling
  }

  // An unterminated payload is not a marker block; leave the range alone. The
  // surrounding root block is removed either way, so nothing leaks.
  if (!node) return marker.nextSibling

  const after: Node | null = node.nextSibling

  for (const child of payload) {
    child.parentNode?.removeChild(child)
    children.push(child)
  }

  marker.parentNode?.removeChild(marker)
  node.parentNode?.removeChild(node)

  return after
}

function containsRootMarker(node: Node): boolean {
  if (commentData(node) === LIGHT_DOM_ROOT_MARKER) return true

  let child = node.firstChild
  while (child) {
    if (containsRootMarker(child)) return true
    child = child.nextSibling
  }

  return false
}

function removeRange(start: Comment, end: Comment): void {
  let node: Node | null = start

  while (node) {
    const next: Node | null = node.nextSibling
    const isEnd = node === end
    node.parentNode?.removeChild(node)
    if (isEnd) break
    node = next
  }
}

function commentData(node: Node): string | undefined {
  return node.nodeType === COMMENT_NODE ? (node as Comment).data : undefined
}
