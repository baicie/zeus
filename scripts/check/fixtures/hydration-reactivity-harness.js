/**
 * Browser-side harness for `check:hydration-reactivity-browser`.
 *
 * It renders the fixture through the SSR target, places the HTML in the page,
 * and mounts through `render(value, container, { hydrate: true })` — the
 * documented hydration entry point. That path opens a session, lets every
 * compiled component adopt its own server nodes, and returns a dispose that
 * tears the adopted tree down.
 *
 * Everything here is plain JavaScript in its own file rather than a template
 * literal: `{}`, `${}` and backticks collide with interpolation.
 */
import { render } from '@zeus-js/runtime-dom'
import { renderToString } from '@zeus-js/runtime-ssr'
import { App, signals } from '/modules/dom.js'
import { App as SsrApp } from '/modules/ssr.js'

export { signals }

/**
 * The SSR HTML for the fixture.
 *
 * `renderToString` wraps the returned node list in a component root, which is
 * what emits the `<!--zeus:hydrate:/c1.root-->` close marker that
 * `adoptComponentRoot` pairs with. Calling `SsrApp()` outside that wrapper
 * produces markers without the close, and adoption then fails with
 * `ZEUS_HYDRATION_REGION_UNTERMINATED` — a mistake this file made first.
 */
export function render_() {
  return renderToString(() => SsrApp({}))
}

let dispose = null

/**
 * Places `html` in the container and hydrates it.
 *
 * `render(App, container, { hydrate: true })` keeps the server markup when the
 * compiled component can adopt it, and falls back to a client render when it
 * cannot. The check asserts that the adopted case is the one that happened by
 * comparing node identity across the call.
 */
export function mount(html) {
  const container = document.getElementById('server')
  container.innerHTML = html
  let error = null
  try {
    dispose = render(() => App({}), container, { hydrate: true })
  } catch (thrown) {
    error = String(thrown)
  }
  return { ok: error === null, error }
}

/**
 * Stops the adopted tree.
 *
 * The dispose returned by `render` owns the session's scope: every effect a
 * compiled binding created is disposed and every listener it added is removed.
 * That is the property the check observes.
 */
signals.dispose = () => {
  if (!dispose) return
  dispose()
  dispose = null
}
