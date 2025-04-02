export let activeEffect: Effect | null = null

export type EffectFunction = () => void

export interface Effect {
  fn: EffectFunction
  deps: Set<Set<Effect>>
  execute: () => void
  dirty?: boolean // 添加脏标记
}

export function useEffect(fn: EffectFunction): void {
  const effect: Effect = {
    fn,
    deps: new Set(),
    dirty: true,
    execute: () => {
      // 避免重复执行
      if (!effect.dirty) return
      effect.dirty = false

      // 清理旧依赖
      effect.deps.forEach(dep => dep.delete(effect))
      effect.deps.clear()

      const prevEffect = activeEffect
      activeEffect = effect

      try {
        fn()
      } finally {
        activeEffect = prevEffect
      }
    },
  }

  effect.execute()
}
