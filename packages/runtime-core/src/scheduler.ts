export type SchedulerJob = () => void

interface SchedulerState {
  queue: SchedulerJob[]
  postFlushQueue: SchedulerJob[]
  isFlushing: boolean
  isFlushPending: boolean
  currentFlushPromise: Promise<void> | null
  resolveCurrentFlushPromise: (() => void) | null
}

function createSchedulerState(): SchedulerState {
  return {
    queue: [],
    postFlushQueue: [],
    isFlushing: false,
    isFlushPending: false,
    currentFlushPromise: null,
    resolveCurrentFlushPromise: null,
  }
}

let schedulerState = createSchedulerState()

export function nextTick(callback?: SchedulerJob): Promise<void> {
  if (callback) {
    return Promise.resolve().then(callback)
  }

  if (schedulerState.currentFlushPromise) {
    return schedulerState.currentFlushPromise
  }

  return Promise.resolve()
}

export function queueJob(job: SchedulerJob): void {
  if (!schedulerState.queue.includes(job)) {
    schedulerState.queue.push(job)
    queueFlush()
  }
}

export function queuePostFlushCb(callback: SchedulerJob): void {
  if (!schedulerState.postFlushQueue.includes(callback)) {
    schedulerState.postFlushQueue.push(callback)
    queueFlush()
  }
}

function queueFlush(): void {
  if (!schedulerState.isFlushPending && !schedulerState.isFlushing) {
    schedulerState.isFlushPending = true
    schedulerState.currentFlushPromise = new Promise(resolve => {
      schedulerState.resolveCurrentFlushPromise = resolve
    })
    nextTick(flushJobs)
  }
}

function flushJobs(): void {
  schedulerState.isFlushPending = false
  schedulerState.isFlushing = true

  try {
    for (let i = 0; i < schedulerState.queue.length; i++) {
      const job = schedulerState.queue[i]
      try {
        job()
      } catch (error) {
        console.error('Error in job:', error)
      }
    }

    schedulerState.queue.length = 0

    for (let i = 0; i < schedulerState.postFlushQueue.length; i++) {
      const callback = schedulerState.postFlushQueue[i]
      try {
        callback()
      } catch (error) {
        console.error('Error in post flush callback:', error)
      }
    }

    schedulerState.postFlushQueue.length = 0
  } finally {
    schedulerState.isFlushing = false

    if (schedulerState.resolveCurrentFlushPromise) {
      schedulerState.resolveCurrentFlushPromise()
      schedulerState.currentFlushPromise = null
      schedulerState.resolveCurrentFlushPromise = null
    }

    if (schedulerState.queue.length || schedulerState.postFlushQueue.length) {
      flushJobs()
    }
  }
}

export function resetScheduler(): void {
  schedulerState = createSchedulerState()
}
