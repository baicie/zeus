/**
 * Browser-side harness for `check:nested-scopes-browser`.
 *
 * `createRuntimeDiagnosticsSession().run()` takes a **synchronous** callback —
 * the counters are thread-local to the call stack, so an `await` inside it would
 * put the mount outside the session. That is why the fixtures export a `mount`
 * function instead of rendering on import: the import is awaited first, then
 * the mount runs inside one synchronous `run`.
 */
import { createRuntimeDiagnosticsSession } from '@zeus-js/signal/diagnostics'

let session = createRuntimeDiagnosticsSession()
let handle = null

/**
 * Loads and mounts a fixture inside a fresh diagnostics session.
 *
 * A new session per call: a second fixture on the same page would otherwise
 * report the first one's scopes in its counts.
 */
export async function mount(name) {
  const container = document.getElementById('app')
  container.innerHTML = ''
  handle = null

  const module = await import(`/fixtures/${name}.js`)

  session = createRuntimeDiagnosticsSession()
  session.run(() => {
    handle = module.mount(container)
  })
  return true
}

/** The counters, read through the session that owns the current fixture. */
export function snapshot() {
  return session.snapshot()
}

/** Drives one of the fixture's signals. */
export function call(method, argument) {
  if (!handle) throw new Error('no fixture is mounted')
  const target = handle[method]
  if (typeof target !== 'function') {
    throw new Error(`the fixture has no signal writer named ${method}`)
  }
  target(argument)
}

/**
 * Sets the fixture's visible set.
 *
 * Separate from `call` because `Set` does not survive structured cloning
 * through `page.evaluate`, so it crosses as an array and is rebuilt here.
 * Folding this into `call` would have turned every array argument into a `Set`
 * — which is what made `<For each={…}>` receive a `Set` and throw.
 */
export function setVisible(values) {
  if (!handle?.setVisible) throw new Error('the fixture has no setVisible')
  handle.setVisible(new Set(values))
}
