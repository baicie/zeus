import { createEffect } from '@zeusjs/core'
import type { Region } from './fragment'
import { clearRegion, insertBeforeEnd } from './fragment'

export function mountList<T>(
  markerStart: Comment,
  markerEnd: Comment,
  list: () => readonly T[],
  renderItem: (item: T, index: () => number) => Node,
  getKey?: (item: T) => string | number,
): void {
  let prevNodes: Node[] = []

  createEffect(() => {
    const items = list()

    for (const n of prevNodes) n.parentNode?.removeChild(n)
    prevNodes = items.map((item, i) => renderItem(item, () => i))

    for (const n of prevNodes) {
      markerEnd.parentNode!.insertBefore(n, markerEnd)
    }
  })
}

export function mountListWithRegion<T>(
  region: Region,
  list: () => readonly T[],
  renderItem: (item: T, index: () => number) => Node,
  getKey?: (item: T) => string | number,
): void {
  let prevNodes: Node[] = []

  createEffect(() => {
    const items = list()

    clearRegion(region)
    prevNodes = items.map((item, i) => renderItem(item, () => i))

    for (const n of prevNodes) {
      insertBeforeEnd(region, n)
    }
  })
}
