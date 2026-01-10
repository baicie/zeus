// packages/runtime-core/src/scheduler/index.ts

export function nextTick(callback: () => void): Promise<void> {
  return Promise.resolve().then(callback)
}

export function queueJob(job: () => void): void {
  // 实现任务队列
  job()
}

export function queuePostFlushCb(callback: () => void): void {
  // 实现后刷新回调队列
  callback()
}
