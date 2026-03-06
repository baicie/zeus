// packages/runtime-core/src/scheduler/index.ts

// 纯函数式调度器
export type SchedulerJob = () => void

// 调度器状态
interface SchedulerState {
  queue: SchedulerJob[]
  postFlushQueue: SchedulerJob[]
  isFlushing: boolean
  isFlushPending: boolean
  currentFlushPromise: Promise<void> | null
  resolveCurrentFlushPromise: (() => void) | null
}

// 创建调度器状态
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

// 全局调度器状态
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
    // 执行所有队列中的任务
    for (let i = 0; i < schedulerState.queue.length; i++) {
      const job = schedulerState.queue[i]
      try {
        job()
      } catch (error) {
        console.error('Error in job:', error)
      }
    }

    // 清空队列
    schedulerState.queue.length = 0

    // 执行后刷新回调
    for (let i = 0; i < schedulerState.postFlushQueue.length; i++) {
      const callback = schedulerState.postFlushQueue[i]
      try {
        callback()
      } catch (error) {
        console.error('Error in post flush callback:', error)
      }
    }

    // 清空后刷新队列
    schedulerState.postFlushQueue.length = 0
  } finally {
    schedulerState.isFlushing = false

    // 解析当前的flush promise
    if (schedulerState.resolveCurrentFlushPromise) {
      schedulerState.resolveCurrentFlushPromise()
      schedulerState.currentFlushPromise = null
      schedulerState.resolveCurrentFlushPromise = null
    }

    // 检查是否有新的任务需要处理
    if (schedulerState.queue.length || schedulerState.postFlushQueue.length) {
      flushJobs()
    }
  }
}

// 重置调度器状态（主要用于测试）
export function resetScheduler(): void {
  schedulerState = createSchedulerState()
}
