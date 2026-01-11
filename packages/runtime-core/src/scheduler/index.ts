// packages/runtime-core/src/scheduler/index.ts

const queue: (() => void)[] = []
const postFlushQueue: (() => void)[] = []
let isFlushing = false
let isFlushPending = false
let currentFlushPromise: Promise<void> | null = null
let resolveCurrentFlushPromise: (() => void) | null = null

export function nextTick(callback?: () => void): Promise<void> {
  if (callback) {
    return Promise.resolve().then(callback)
  }

  if (currentFlushPromise) {
    return currentFlushPromise
  }

  return Promise.resolve()
}

export function queueJob(job: () => void): void {
  if (!queue.includes(job)) {
    queue.push(job)
    queueFlush()
  }
}

export function queuePostFlushCb(callback: () => void): void {
  if (!postFlushQueue.includes(callback)) {
    postFlushQueue.push(callback)
    queueFlush()
  }
}

function queueFlush(): void {
  if (!isFlushPending && !isFlushing) {
    isFlushPending = true
    currentFlushPromise = new Promise(resolve => {
      resolveCurrentFlushPromise = resolve
    })
    nextTick(flushJobs)
  }
}

function flushJobs(): void {
  isFlushPending = false
  isFlushing = true

  try {
    // 执行所有队列中的任务
    for (let i = 0; i < queue.length; i++) {
      const job = queue[i]
      try {
        job()
      } catch (error) {
        console.error('Error in job:', error)
      }
    }

    // 清空队列
    queue.length = 0

    // 执行后刷新回调
    for (let i = 0; i < postFlushQueue.length; i++) {
      const callback = postFlushQueue[i]
      try {
        callback()
      } catch (error) {
        console.error('Error in post flush callback:', error)
      }
    }

    // 清空后刷新队列
    postFlushQueue.length = 0
  } finally {
    isFlushing = false

    // 解析当前的flush promise
    if (resolveCurrentFlushPromise) {
      resolveCurrentFlushPromise()
      currentFlushPromise = null
      resolveCurrentFlushPromise = null
    }

    // 检查是否有新的任务需要处理
    if (queue.length || postFlushQueue.length) {
      flushJobs()
    }
  }
}

// 任务优先级
export enum SchedulerJobFlags {
  /**
   * 同步任务
   */
  SYNC = 1,
  /**
   * 组件更新任务
   */
  COMPONENT_UPDATE = 1 << 1,
  /**
   * 渲染任务
   */
  RENDER = 1 << 2,
  /**
   * 后刷新任务
   */
  POST_FLUSH = 1 << 3,
}

// 带优先级的任务队列
export function queueJobWithPriority(
  job: () => void,
  priority: SchedulerJobFlags = SchedulerJobFlags.SYNC,
): void {
  if (priority & SchedulerJobFlags.POST_FLUSH) {
    queuePostFlushCb(job)
  } else {
    queueJob(job)
  }
}
