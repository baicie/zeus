// packages/signal/src/scheduler.ts

const queue = new Set<() => void>()
let flushing = false
let pending = false

export function queueJob(job: () => void): void {
  queue.add(job)

  if (!pending) {
    pending = true
    queueMicrotask(flushJobs)
  }
}

export function flushJobs(): void {
  if (flushing) return

  pending = false
  flushing = true

  // A failing job must not drop the jobs queued after it; run them all and
  // rethrow the first error once the queue is drained.
  let error: unknown
  let hasError = false
  try {
    for (const job of queue) {
      try {
        job()
      } catch (err) {
        if (!hasError) {
          hasError = true
          error = err
        }
      }
    }
  } finally {
    queue.clear()
    flushing = false
  }
  if (hasError) throw error
}

export function nextTick(): Promise<void> {
  return Promise.resolve()
}
