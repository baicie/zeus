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

/* eslint-env browser */
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

/**
 * Hydrates a plan whose third binding targets a wrong-tag node.
 *
 * The first two handlers run and register listeners; the third throws, and
 * whatever `runHydration` does about the partial work is what the check
 * observes. Returns what survived.
 */
export function hydrateUntilFailure(html) {
  const container = document.getElementById('server')
  container.innerHTML = html
  const clicked = []
  let firstListener = null
  let disposed = false

  const plan = window.__plan
  const handlers = {}
  // Count first: this fixture has only a couple of bindings, so "fail at the
  // third" needs the total rather than an assumed size.
  let total = 0
  for (const component of plan.components) {
    for (const node of component.nodes) total += node.bindings.length
  }
  let seen = 0
  for (const component of plan.components) {
    for (const node of component.nodes) {
      for (const binding of node.bindings) {
        seen += 1
        const ordinal = seen
        handlers[binding.id] = (context, planBinding, planNode) => {
          if (ordinal === total && total >= 2) {
            // Ask for a tag the node does not have. `context.nodes` throws
            // `ZEUS_HYDRATION_TAG_MISMATCH` for it, which is a real failure of
            // the same kind a mismatched server tree produces — and it happens
            // after two handlers have already run, which is the point.
            context.nodes(planNode.id, 'definitely-not-this-tag')
            return
          }
          if (ordinal >= total) return
          if (binding.kind === 'event') {
            context.event(
              planNode.id,
              binding.name,
              () => clicked.push(ordinal),
              0,
            )
            firstListener = () => clicked.length
          }
        }
      }
    }
  }

  let error = null
  try {
    const dispose = hydratePlan(container, plan, handlers)
    // Keep the dispose reachable so a caller can prove the successful path
    // still tears down.
    window.__disposeAfterFailure = dispose
  } catch (thrown) {
    error = String(thrown)
    disposed = true
  }
  return {
    error,
    disposed,
    handlerCount: seen,
    total,
    listenerProbe: firstListener,
  }
}

/**
 * Probes `hydratePlan`'s diagnostics one at a time.
 *
 * A diagnostic that cannot be triggered is a diagnostic nobody knows works:
 * the message may name the wrong construct, or the branch may be unreachable
 * behind a later check. Each entry below builds the smallest plan that reaches
 * its code, so the contract in `docs/architecture/compiler/` is about behaviour
 * rather than about strings that exist in the source.
 *
 * `hydratePlan`-only: `ZEUS_HYDRATION_DUPLICATE_OWNER`,
 * `ZEUS_HYDRATION_REGION_UNTERMINATED`, `ZEUS_HYDRATION_TEXT_MISMATCH`,
 * `ZEUS_HYDRATION_ATTR_MISMATCH`, `ZEUS_HYDRATION_EXTRA_NODE`,
 * `ZEUS_HYDRATION_UNHYDRATED_COMPONENT` and `ZEUS_HYDRATION_UNSUPPORTED` live on
 * the auto-hydration path, which this harness does not drive. They are listed
 * here rather than silently omitted.
 */
export function probeDiagnostics(html) {
  const container = document.getElementById('server')
  const results = {}

  /** Runs one plan and returns the diagnostic code, or null on success. */
  const attempt = mutate => {
    container.innerHTML = html
    const plan = JSON.parse(JSON.stringify(window.__plan))
    const handlers = {}
    for (const component of plan.components) {
      for (const node of component.nodes) {
        for (const binding of node.bindings) {
          handlers[binding.id] = () => {}
        }
      }
    }
    const outcome = mutate(plan, handlers, container)
    if (outcome !== undefined) return outcome
    try {
      hydratePlan(container, plan, handlers)
      return null
    } catch (error) {
      const match = /ZEUS_HYDRATION_[A-Z_]+/.exec(String(error))
      return match ? match[0] : String(error)
    }
  }

  results['unsupported plan version'] = attempt(plan => {
    plan.version = 99
    return undefined
  })

  results['MARKER_MISSING'] = attempt((plan, _handlers, host) => {
    // Remove a required marker from the tree the plan expects.
    const required = plan.components
      .flatMap(component => component.nodes)
      .find(node => !node.optional && node.kind === 'element')
    host.innerHTML = host.innerHTML.replace(
      new RegExp(
        `<!--zeus:hydrate:${required.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-->`,
      ),
      '',
    )
    return undefined
  })

  results['HANDLER_MISSING'] = attempt((plan, handlers) => {
    const first = plan.components
      .flatMap(component => component.nodes)
      .flatMap(node => node.bindings)[0]
    if (!first) return 'no bindings in the fixture plan'
    delete handlers[first.id]
    return undefined
  })

  results['OCCURRENCE_MISSING'] = attempt((plan, handlers) => {
    // A text node that names occurrence 5 when only one exists.
    const node = plan.components
      .flatMap(component => component.nodes)
      .find(candidate => candidate.kind === 'text')
    if (!node) return 'no text node in the fixture plan'
    const binding = node.bindings[0]
    if (!binding) return 'the text node has no binding'
    handlers[binding.id] = (context, _planBinding, planNode) => {
      context.node(planNode.id, undefined, 5)
    }
    return undefined
  })

  results['TEXT_TARGET'] = attempt((plan, handlers) => {
    // Ask for text at an element's marker.
    const node = plan.components
      .flatMap(component => component.nodes)
      .find(candidate => candidate.kind === 'element')
    if (!node) return 'no element in the fixture plan'
    handlers[1] = context => context.text(node.id, () => 'x', 0)
    plan.components[0].nodes.push({
      id: node.id,
      nodeId: node.nodeId,
      kind: 'text',
      optional: false,
      bindings: [{ id: 1, kind: 'text' }],
    })
    return undefined
  })

  results['ELEMENT_TARGET'] = attempt((plan, handlers) => {
    // Ask for an element at a text node's marker.
    const node = plan.components
      .flatMap(component => component.nodes)
      .find(candidate => candidate.kind === 'text')
    if (!node) return 'no text node in the fixture plan'
    handlers[1] = context => context.attr(node.id, 'x', () => 'y', 0)
    plan.components[0].nodes.push({
      id: node.id,
      nodeId: node.nodeId,
      kind: 'element',
      optional: false,
      bindings: [{ id: 1, kind: 'attr', name: 'x' }],
    })
    return undefined
  })

  return results
}
