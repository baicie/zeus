/**
 * Browser-side harness for `check:ssr-hydration-browser`.
 *
 * Plain JavaScript, served as its own module. It lives in a file rather than a
 * template literal because everything here — `{}`, `${}`, backticks — collides
 * with template interpolation, and the first two attempts at inlining it both
 * failed to parse.
 *
 * It imports the two compiled fixture modules and exposes:
 *
 *   render()          the SSR HTML for the fixture
 *   hydrate(html)     place `html` in the container, run `hydratePlan`, and
 *                     report which server nodes survived by identity
 *   hydrateWithNoHandlers(html)
 *                     the same, but with an empty handler map, so the missing
 *                     handler path can be observed
 */
import { hydratePlan } from '@zeus-js/runtime-dom'
import { renderToString } from '@zeus-js/runtime-ssr'
import { App as SsrApp } from '/modules/ssr.js'

const PROPS = { title: 'server title', open: true, items: ['a', 'b'] }

export function render() {
  return renderToString(() => SsrApp(PROPS))
}

function place(html) {
  const container = document.getElementById('server')
  container.innerHTML = html
  const before = {}
  for (const node of container.querySelectorAll('[id]')) {
    before[node.id] = node
  }
  return { container, before }
}

function reuseReport(container, before) {
  const reused = {}
  for (const [id, node] of Object.entries(before)) {
    reused[id] = node === document.getElementById(id)
  }
  return { reused, ids: Object.keys(before) }
}

export function hydrate(html) {
  const { container, before } = place(html)
  let error = null
  try {
    const plan = window.__plan
    const handlers = {}
    for (const component of plan.components) {
      for (const node of component.nodes) {
        for (const binding of node.bindings) {
          handlers[binding.id] = (context, planBinding, planNode) => {
            window.__handlerRuns = (window.__handlerRuns || 0) + 1
            window.__handlerNodes = window.__handlerNodes || {}
            window.__handlerNodes[planBinding.id] = planNode.id
          }
        }
      }
    }
    window.__dispose = hydratePlan(container, plan, handlers)
  } catch (thrown) {
    error = String(thrown)
  }
  return { ok: error === null, error, ...reuseReport(container, before) }
}

export function hydrateWithNoHandlers(html) {
  const { container, before } = place(html)
  let error = null
  try {
    window.__dispose = hydratePlan(container, window.__plan, {})
  } catch (thrown) {
    error = String(thrown)
  }
  return { ok: error === null, error, ...reuseReport(container, before) }
}
