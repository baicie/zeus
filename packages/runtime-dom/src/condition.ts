import { createEffect } from '@zeusjs/core'
import type { Region } from './fragment'
import { clearRegion, insertBeforeEnd } from './fragment'

export function mountCondition(
  markerStart: Comment,
  markerEnd: Comment,
  when: () => unknown,
  factory: () => Node,
): void {
  let mounted = false
  let current: Node | null = null

  createEffect(() => {
    const visible = !!when()

    if (visible && !mounted) {
      current = factory()
      markerEnd.parentNode!.insertBefore(current, markerEnd)
      mounted = true
      return
    }

    if (!visible && mounted) {
      current?.parentNode?.removeChild(current)
      current = null
      mounted = false
    }
  })
}

export function mountConditionWithRegion(
  region: Region,
  when: () => unknown,
  factory: () => Node,
): void {
  let mounted = false
  let current: Node | null = null

  createEffect(() => {
    const visible = !!when()

    if (visible && !mounted) {
      current = factory()
      insertBeforeEnd(region, current)
      mounted = true
      return
    }

    if (!visible && mounted) {
      clearRegion(region)
      mounted = false
    }
  })
}
