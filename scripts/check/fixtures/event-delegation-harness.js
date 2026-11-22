/**
 * Browser-side harness for `check:event-delegation-browser`.
 *
 * Records every handler invocation into one array, and exposes the fixture's
 * signal writers. Separate from the fixture because the props object the
 * fixture closes over lives here, not in the compiled module.
 */
let log = []
let handle = null

/** Mounts the fixture with a props object whose `log` appends here. */
export async function mount(stopPropagation) {
  const container = document.getElementById('app')
  container.innerHTML = ''
  log = []
  handle = null

  const module = await import('/fixture.js')
  handle = module.mount(container, {
    log: entry => log.push(entry),
    stop: Boolean(stopPropagation),
  })
}

/** Every handler call since the last `reset`, in order. */
export function entries() {
  return log.slice()
}

/** Clears the log without touching the tree. */
export function reset() {
  log = []
}

/** Drives the Show. */
export function setOpen(value) {
  if (!handle?.setOpen) throw new Error('the fixture has no setOpen')
  handle.setOpen(Boolean(value))
}

/** Drives the For. */
export function setRows(rows) {
  if (!handle?.setRows) throw new Error('the fixture has no setRows')
  handle.setRows(rows)
}
