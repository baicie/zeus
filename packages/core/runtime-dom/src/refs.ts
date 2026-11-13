import {
  getCurrentScope,
  onScopeDispose,
  untrack,
} from '@zeus-js/signal/internal'

import type { RefTarget } from './types'

/**
 * Runs the ref target outside tracking.
 *
 * A ref callback is a mount hook, not a rendering expression: it runs when the
 * element it points at exists, and it must not re-run because something it
 * happened to read changed. Without this, a callback that seeds a field from a
 * signal (`ref={el => seed(el, draft().email)}`) makes the enclosing dynamic
 * region depend on `draft`, so every keystroke rebuilds the subtree that holds
 * the field. The rebuilt field is a new node, has no `dataset` marker, and is
 * seeded again from the stale value the render started with — the user's text
 * is lost, and a submit compares against the old value and sends `{}`.
 *
 * This is the same rule `spread.ts` already states and enforces ("Committing
 * user refs … must happen after the effect has exited"); the `bindRef` path
 * had simply missed it. `docs/rfcs/RFC-008` records it for spread, but the ref
 * guides are silent on the tracking boundary — until this comment, nothing a
 * user would read said which side of it a ref callback runs on.
 *
 * `untrack` rather than a manual flag: the read is a genuine read, it just must
 * not become an edge. Values the callback wants to publish must go through
 * signals it writes, which is unaffected — `untrack` pauses tracking only.
 *
 * The whole dispatch is wrapped, not just the function case: `'value' in
 * target` on a reactive container runs the `has` trap and would otherwise
 * create a dependency of its own.
 */
export function setRef<T>(
  target: RefTarget<T> | null | undefined,
  value: T | null,
): void {
  if (target == null) return

  untrack(() => {
    if (typeof target === 'function') {
      target(value)
      return
    }

    if ('value' in target) {
      target.value = value
      return
    }

    if ('current' in target) {
      target.current = value
      return
    }

    if (__DEV__) {
      console.warn('[Zeus runtime] Invalid ref target:', target)
    }
  })
}

export function bindRef<T extends Element>(
  el: T,
  target: RefTarget<T> | null | undefined,
): void {
  setRef(target, el)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      setRef(target, null)
    }, true)
  }
}
