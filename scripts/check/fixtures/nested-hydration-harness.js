/**
 * Browser-side harness for `check:nested-hydration-browser`.
 *
 * Each entry places fresh server HTML and hydrates it, so the checks do not
 * share a container or a session. `mountTrackingIdentity` is the same operation
 * with the server nodes' references captured before `render` runs, which is the
 * only way to see whether a node was adopted or rebuilt: the DOM is identical
 * either way.
 */
import { render } from '@zeus-js/runtime-dom'
import { renderToString } from '@zeus-js/runtime-ssr'
import { createRuntimeDiagnosticsSession } from '@zeus-js/signal/diagnostics'
import { App, signals } from '/modules/dom.js'
import { App as SsrApp, signals as ssrSignals } from '/modules/ssr.js'

/**
 * The controllers the checks drive, taken from the modules that own them
 * (R24.1 TASK 03).
 *
 * The fixture used to assign its signals to `window.__signals`, and it is
 * compiled twice — once for the server, once for the client — so both copies
 * ran that assignment and whichever loaded last won. With the client module
 * imported first, the global pointed at the *server* copy: every write went to
 * a signal no rendered tree subscribed to, and the DOM never changed. Swapping
 * the two imports made the same test pass, which is what confirmed it.
 *
 * These are exported by value from each module instead. `controls` is the
 * client module's set — the one the hydrated tree is bound to — and
 * `ssrControls` exists so a test can prove the two really are separate objects
 * rather than trusting that they are.
 */
export const controls = signals
export const ssrControls = ssrSignals

/**
 * Asserts the control signal is the one the rendered tree subscribes to.
 *
 * A test-only diagnostic, not a runtime API. It exists because the failure it
 * catches is silent: if `controls` pointed at the server module's copy, every
 * write would go to a signal nothing renders, the DOM would not change, and the
 * only symptom would be a timeout in whichever assertion happened to run first.
 * The code name says what is wrong rather than where it surfaced.
 */
export function assertControlsBound() {
  if (controls === ssrControls) {
    throw new Error(
      'CONTROL_SIGNAL_NOT_BOUND_TO_DOM: the harness controls point at the SSR ' +
        "module's signals, so writes cannot reach the hydrated tree",
    )
  }
  if (controls.label === ssrControls.label) {
    throw new Error(
      'CONTROL_SIGNAL_NOT_BOUND_TO_DOM: the two modules share a signal object, ' +
        'which means one of them is not creating its own',
    )
  }
}

let session = createRuntimeDiagnosticsSession()
let dispose = null

/**
 * The SSR HTML for the fixture.
 *
 * Not named `render`: this module already imports `render` from the runtime,
 * and the two declarations collide at parse time — the page failed with
 * `Identifier 'render' has already been declared` before anything ran.
 */
export function ssrHtml() {
  return renderToString(() => SsrApp())
}

/** Places `html` and hydrates it. */
function hydrate(html) {
  // Dispose the previous tree before replacing its markup. A second `render`
  // on the same container leaves the first root alive and subscribed to the
  // same module-level signals, so two trees answer every write and the one the
  // check reads from is whichever rendered last.
  if (dispose) {
    try {
      dispose()
    } catch {
      /* an already-disposed tree is what we want anyway */
    }
    dispose = null
  }
  const container = document.getElementById('server')
  container.innerHTML = html
  return hydratePlaced(container)
}

/**
 * Hydrates a container whose server HTML is already in place.
 *
 * Split from `hydrate` because assigning `innerHTML` again would discard the
 * very nodes the caller is about to check identity against.
 */
function hydratePlaced(container) {
  session = createRuntimeDiagnosticsSession()
  let error = null
  session.run(() => {
    try {
      dispose = render(() => App(), container, {
        hydrate: true,
        onHydrationError: thrown => {
          error = String(thrown)
        },
      })
    } catch (thrown) {
      error = String(thrown)
    }
  })
  return { ok: error === null, error }
}

export function mount(html) {
  return hydrate(html)
}

/**
 * Hydrates while tracking which server nodes survived.
 *
 * Every element with an id is remembered before `render`, then looked up again
 * afterwards. A replaced node keeps its id but not its identity.
 */
export function mountTrackingIdentity(html) {
  const container = document.getElementById('server')
  // Release the previous tree's hydration owner before replacing its markup.
  //
  // `beginHydrationSession` refuses a container that already has a live owner,
  // and that guard is right: two live sessions on one container would each
  // think they own the markers. This function skipped the dispose, so the
  // hydrate below threw, the container kept the *previous* tree's nodes, and
  // every id then looked replaced. Every check after this one ran against a
  // tree the caller believed it had replaced.
  if (dispose) {
    try {
      dispose()
    } catch {
      /* an already-disposed tree is what we want anyway */
    }
    dispose = null
  }
  // Placed once and read back by the caller. Re-assigning `innerHTML` from the
  // same string would rebuild every node before hydration starts, so every id
  // would look replaced; the reference map is taken after this one assignment.
  container.innerHTML = html
  const before = new Map()
  for (const node of container.querySelectorAll('[id]')) {
    before.set(node.id, node)
  }

  const outcome = hydratePlaced(container)
  const replaced = []
  for (const [id, node] of before) {
    if (document.getElementById(id) !== node) replaced.push(id)
  }
  return { ...outcome, replaced }
}

/**
 * Reports marker ownership: which component roots the server wrote, and whether
 * any marker id appears more than once across component roots.
 *
 * Within one component a marker legitimately repeats (a For item's template),
 * so the duplicate check is on *root* markers only — one per component.
 */
export function markerOwnership(html) {
  const roots = [...html.matchAll(/<!--zeus:hydrate:(c\d+\.root)-->/g)].map(
    match => match[1],
  )
  const seen = new Set()
  const duplicates = []
  for (const id of roots) {
    if (seen.has(id)) duplicates.push(id)
    seen.add(id)
  }
  return { roots, duplicates }
}

/**
 * Hydrates with two component root markers exchanged.
 *
 * The server wrote component A's root where component B belongs. A client that
 * looked markers up by position rather than by owner would adopt across the
 * boundary and leave the tree bound to the wrong components.
 */
export function mountWithSwappedRoots(html) {
  const markers = [...html.matchAll(/<!--zeus:hydrate:(c\d+\.root)-->/g)]
  if (markers.length < 2) {
    return { ok: false, error: 'the fixture produced fewer than two roots' }
  }
  const [first, second] = markers
  const swapped = html
    .replace(first[0], '\u0000FIRST')
    .replace(second[0], first[0])
    .replace('\u0000FIRST', second[0])
  return hydrate(swapped)
}

/** The counters for the current hydration. */
export function snapshot() {
  return session.snapshot()
}

/** Stops the hydrated tree. */
export function unmount() {
  if (!dispose) return
  dispose()
  dispose = null
}
