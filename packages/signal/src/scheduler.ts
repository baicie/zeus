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

  try {
    for (const job of queue) {
      job()
    }
  } finally {
    queue.clear()
    flushing = false
  }
}

export function nextTick(): Promise<void> {
  return Promise.resolve()
}
