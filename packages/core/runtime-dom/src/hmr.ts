import { batch, createSignal } from '@zeus-js/signal'

import { emitDevtoolsEvent } from './devtools'

interface HmrBinding {
  id: number
  kind: string
  value: string
}

interface HmrPlan {
  version: number
  signature: string
  bindings: HmrBinding[]
}

interface HmrHotContext {
  on(event: string, callback: (data: unknown) => void): void
  off(event: string, callback: (data: unknown) => void): void
  invalidate(message: string): void
}

const PATCH_EVENT = 'zeus:hmr-patch'
let activeWrites = 0

/** @internal HMR failures must roll back before application error handling. */
export function isHmrBindingWrite(): boolean {
  return activeWrites > 0
}

/** Compiler helper for literal cells. Never emitted by SSR or production. */
export function createHmrState(
  hot: HmrHotContext | undefined,
  filename: string,
  initial: HmrPlan,
): { read(id: number): string; dispose(): void } {
  const cells = new Map(
    initial.bindings.map(binding => [binding.id, createSignal(binding.value)]),
  )
  let current = initial
  let disposed = false

  const receive = (data: unknown): void => {
    if (disposed || !isRecord(data) || data.filename !== filename) return
    const { previous, next } = data
    if (!isPlan(previous) || !isPlan(next) || !sameSchema(initial, next)) {
      invalidate(
        'plan-mismatch',
        '[ZEUS_HMR_PLAN_MISMATCH] Invalid compiler binding plan',
      )
      return
    }
    if (sameValues(current, next)) return
    if (!sameSchema(current, previous) || !sameValues(current, previous)) {
      invalidate(
        'stale-patch',
        '[ZEUS_HMR_STALE_PATCH] Missing or out-of-order update',
      )
      return
    }

    const write = (plan: HmrPlan): void => {
      activeWrites++
      try {
        batch(() => {
          for (const binding of plan.bindings) {
            cells.get(binding.id)![1](binding.value)
          }
        })
      } finally {
        activeWrites--
      }
    }
    try {
      write(next)
      current = next
      emitHmrEvent('hmr:patch', {
        reason: 'literal-binding',
        filename,
        bindingCount: next.bindings.length,
      })
    } catch (error) {
      try {
        write(current)
      } catch (rollbackError) {
        console.error('[ZEUS_HMR_ROLLBACK_FAILED]', rollbackError)
      }
      console.error('[ZEUS_HMR_PATCH_FAILED]', error)
      invalidate(
        'patch-failed',
        '[ZEUS_HMR_PATCH_FAILED] Binding update was rolled back',
      )
    }
  }

  const invalidate = (reason: string, message: string): void => {
    emitHmrEvent('hmr:invalidate', { reason, filename })
    hot?.invalidate(message)
  }

  if (__DEV__ && hot) {
    hot.on(PATCH_EVENT, receive)
  }

  return {
    read(id) {
      const cell = cells.get(id)
      if (!cell) throw new Error(`[ZEUS_HMR_UNKNOWN_BINDING] ${id}`)
      return cell[0]()
    },
    dispose() {
      disposed = true
      hot?.off(PATCH_EVENT, receive)
      emitHmrEvent('hmr:dispose', { reason: 'module-dispose', filename })
      // Codegen calls this after root disposal, so cleanup code can still
      // read its old cells. Vite stores only ONE dispose callback per module.
      cells.clear()
    },
  }

  function emitHmrEvent(
    type: 'hmr:patch' | 'hmr:invalidate' | 'hmr:dispose',
    payload: Readonly<Record<string, unknown>>,
  ): void {
    if (!__DEV__) return
    emitDevtoolsEvent({ type, payload }, { swallowErrors: true })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPlan(value: unknown): value is HmrPlan {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.signature === 'string' &&
    Array.isArray(value.bindings) &&
    value.bindings.every(
      binding =>
        isRecord(binding) &&
        Number.isSafeInteger(binding.id) &&
        typeof binding.kind === 'string' &&
        typeof binding.value === 'string',
    )
  )
}

function sameSchema(left: HmrPlan, right: HmrPlan): boolean {
  return (
    left.version === right.version &&
    left.signature === right.signature &&
    left.bindings.length === right.bindings.length &&
    left.bindings.every(
      (binding, index) =>
        binding.id === right.bindings[index].id &&
        binding.kind === right.bindings[index].kind,
    )
  )
}

function sameValues(left: HmrPlan, right: HmrPlan): boolean {
  return (
    sameSchema(left, right) &&
    left.bindings.every(
      (binding, index) => binding.value === right.bindings[index].value,
    )
  )
}
