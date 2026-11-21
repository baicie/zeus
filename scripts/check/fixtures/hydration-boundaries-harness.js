/**
 * Browser-side harness for `check:hydration-boundaries-browser`.
 *
 * Served as its own module: the case list, the regexes and the template
 * interpolation all collide with a TypeScript template literal.
 *
 * `CASES` is injected by the server as `/cases.js` so the harness does not need
 * to know the fixture names.
 */
import { render } from '@zeus-js/runtime-dom'
import { renderToString } from '@zeus-js/runtime-ssr'
import { CASE_NAMES } from '/cases.js'
import { PROPS } from '/props.js'

const SSR = {}
const DOM = {}

const loaders = Object.fromEntries(
  CASE_NAMES.map(name => [
    name,
    () =>
      Promise.all([
        import(`/modules/${name}.ssr.js`),
        import(`/modules/${name}.dom.js`),
      ]).then(([ssr, dom]) => {
        SSR[name] = ssr.App
        DOM[name] = dom.App
      }),
  ]),
)

/**
 * Renders and hydrates one case.
 *
 * The container is refilled each time: two live hydration sessions cannot share
 * a container, and `beginHydrationSession` enforces it.
 */
export async function run(name) {
  if (!SSR[name]) await loaders[name]()
  const container = document.getElementById('server')
  const html = renderToString(() => SSR[name](PROPS))
  container.innerHTML = html
  let error = null
  try {
    render(() => DOM[name](PROPS), container, { hydrate: true })
  } catch (thrown) {
    error = String(thrown)
  }
  return {
    ok: error === null,
    error,
    html,
    rendered: container.innerHTML,
    text: container.textContent,
    // A close marker in the server HTML with no open marker immediately before
    // it would mean SSR wrote a region end for a region it never opened.
    orphanClose:
      html.includes('<!--zeus:hydrate:/-->') &&
      !/<!--zeus:hydrate:[^/>][^>]*-->\s*<!--zeus:hydrate:\/-->/.test(html),
  }
}
