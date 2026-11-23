/**
 * Region cleanup stays inside its own boundaries (R24 TASK 29).
 *
 * `openRegion` clears everything between a region's open and close markers
 * before the branch is rebuilt. `clearRange` walks `open.nextSibling` until it
 * reaches `close`, removing each node — so the blast radius depends entirely on
 * `close` being in the same parent as `open`.
 *
 * That holds today because `findCloseMarker` only walks siblings: a close on a
 * different parent is never returned, so `openRegion` reports
 * `ZEUS_HYDRATION_REGION_UNTERMINATED` instead of clearing across the boundary.
 * The risk is not that this is wrong now; it is that the guarantee lives in one
 * helper and is relied on by another, and nothing says so.
 *
 * These tests pin the pair of facts the safety depends on:
 *
 *   * a close marker outside the region's parent is never adopted;
 *   * clearing removes only nodes strictly between the two markers.
 *
 * They drive `AutoHydrationSession` directly rather than through a compiled
 * component, because a compiled fixture cannot produce a malformed marker
 * layout — the compiler only emits well-formed ones. The malformed layout is
 * the thing under test.
 */
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { AutoHydrationSession } from '../src/autoHydration'

function session(html: string): {
  session: AutoHydrationSession
  container: Element
  document: Document
} {
  const dom = new JSDOM(`<div id="root">${html}</div>`)
  const container = dom.window.document.getElementById('root')!
  return {
    session: new AutoHydrationSession(container, {}),
    container,
    document: dom.window.document,
  }
}

describe('region boundaries', () => {
  it('clears only the nodes strictly between the open and close markers', () => {
    // Three siblings around the region: the ones outside it must survive.
    const { session: current, container } = session(
      '<i id="before">a</i>' +
        '<!--zeus:hydrate:c1.s2--><b id="inside">x</b><!--zeus:hydrate:/c1.s2-->' +
        '<i id="after">b</i>',
    )

    const anchor = current.createHandle().region('c1.s2')

    // Only the node inside the region may be cleared.
    expect(
      Array.from(container.querySelectorAll('[id]')).map(node => node.id),
    ).toEqual(['before', 'after'])
    // The anchor stays in the container rather than being removed with the
    // region it terminates.
    expect(anchor.parentNode).toBe(container)
    // The anchor is the close comment, not an element.
    expect((anchor as unknown as { nodeType: number }).nodeType).toBe(8)
  })

  it('refuses a close marker that sits on a different parent', () => {
    // The close marker is inside a nested element, so it is not a sibling of
    // the open marker. If `findCloseMarker` walked the whole document instead
    // of the sibling list, `clearRange` would then remove everything up to it —
    // across a boundary, and past nodes belonging to other components.
    const { session: current } = session(
      '<!--zeus:hydrate:c1.s2--><b id="inside">x</b><p id="other"><!--zeus:hydrate:/c1.s2--></p>',
    )

    expect(
      () => current.createHandle().region('c1.s2'),
      'a close marker under another parent must be reported, never adopted',
    ).toThrow(/ZEUS_HYDRATION_REGION_UNTERMINATED/)
  })

  it('leaves a sibling component root untouched while clearing a region', () => {
    const { session: current, container } = session(
      '<!--zeus:hydrate:c1.s2--><b id="inside">x</b><!--zeus:hydrate:/c1.s2-->' +
        '<!--zeus:hydrate:c9.root--><em id="sibling">y</em><!--zeus:hydrate:/c9.root-->',
    )

    current.createHandle().region('c1.s2')

    // The sibling component root must survive another region being cleared.
    expect(
      Array.from(container.querySelectorAll('[id]')).map(node => node.id),
    ).toEqual(['sibling'])
  })

  it('reports an unterminated region when the close marker is absent', () => {
    const { session: current } = session(
      '<!--zeus:hydrate:c1.s2--><b id="inside">x</b>',
    )
    expect(() => current.createHandle().region('c1.s2')).toThrow(
      /ZEUS_HYDRATION_REGION_UNTERMINATED/,
    )
  })

  it('does not clear a second region that shares the container', () => {
    const { session: current, container } = session(
      '<!--zeus:hydrate:c1.s2--><b id="first">x</b><!--zeus:hydrate:/c1.s2-->' +
        '<!--zeus:hydrate:c1.s3--><i id="second">y</i><!--zeus:hydrate:/c1.s3-->',
    )

    const handle = current.createHandle()
    handle.region('c1.s2')

    // Clearing the first region must not touch the second.
    expect(
      Array.from(container.querySelectorAll('[id]')).map(node => node.id),
    ).toEqual(['second'])
  })
})
