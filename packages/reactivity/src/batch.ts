import type { Effect } from './effect'

let batchDepth = 0
const pendingUpdates = new Set<Effect>()

export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      flushUpdates()
    }
  }
}

export function queueUpdate(effect: Effect): void {
  // 标记为脏，等待更新
  effect.dirty = true

  if (batchDepth > 0) {
    pendingUpdates.add(effect)
  } else {
    effect.execute()
  }
}

function flushUpdates() {
  // 创建一个副本以避免在迭代过程中修改集合
  const effects = Array.from(pendingUpdates)
  pendingUpdates.clear()

  // 对 effects 进行拓扑排序，确保依赖先更新
  const sorted = topologicalSort(effects)

  for (const effect of sorted) {
    if (effect.dirty) {
      effect.execute()
    }
  }
}

// 简单的拓扑排序实现
function topologicalSort(effects: Effect[]): Effect[] {
  // 这里实现一个简单的拓扑排序
  // 在实际实现中，你需要根据依赖关系构建有向图并排序
  return effects
}
