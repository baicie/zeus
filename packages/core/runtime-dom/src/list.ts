// packages/runtime-dom/src/list.ts

import { effect, onScopeDispose, stop } from '@zeus-js/signal'

import { getCurrentOwner, runWithOwner } from './context'
import { emitDevtoolsEvent } from './devtools'
import { insertTracked, moveRangeBefore, removeNodes } from './range'

import type { JSXValue } from './types'

type Key = unknown

type ListRecord<T> = {
  key: Key
  item: T
  index: number
  nodes: Node[]
}

export function mountFor<T, K = unknown>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  if (!key) {
    mountIndexFor(parent, marker, each, render)
    return
  }

  mountKeyedFor(parent, marker, each, key, render)
}

function mountIndexFor<T>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  let current: Node[] = []
  const owner = getCurrentOwner()

  const runner = effect(() => {
    removeNodes(current)
    current = []

    const list = each() ?? []

    for (let i = 0; i < list.length; i++) {
      current.push(
        ...insertTracked(
          parent,
          runWithOwner(owner, () => render(list[i], i)),
          marker,
        ),
      )
    }
  })

  onScopeDispose(() => {
    stop(runner)
    removeNodes(current)
    current = []
  }, true)
}

function mountKeyedFor<T, K>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: (item: T, index: number) => K,
  render: (item: T, index: number) => JSXValue,
): void {
  let records: ListRecord<T>[] = []
  const owner = getCurrentOwner()

  const runner = effect(() => {
    const nextItems = each() ?? []
    const oldMap = new Map<Key, ListRecord<T>>()

    for (const record of records) {
      oldMap.set(record.key, record)
    }

    const nextRecords: ListRecord<T>[] = []

    for (let i = 0; i < nextItems.length; i++) {
      const item = nextItems[i]
      const itemKey = key(item, i)
      const oldRecord = oldMap.get(itemKey)

      if (oldRecord) {
        oldMap.delete(itemKey)
        oldRecord.item = item
        oldRecord.index = i
        nextRecords.push(oldRecord)
      } else {
        nextRecords.push({
          key: itemKey,
          item,
          index: i,
          nodes: insertTracked(
            parent,
            runWithOwner(owner, () => render(item, i)),
            marker,
          ),
        })
      }
    }

    for (const record of oldMap.values()) {
      removeNodes(record.nodes)
    }

    for (let i = nextRecords.length - 1; i >= 0; i--) {
      const record = nextRecords[i]
      const anchor =
        i === nextRecords.length - 1
          ? marker
          : (nextRecords[i + 1].nodes[0] ?? marker)

      moveRangeBefore(record.nodes, parent, anchor)
    }

    emitDevtoolsEvent({ type: 'mount-for', length: nextRecords.length })

    records = nextRecords
  })

  onScopeDispose(() => {
    stop(runner)

    for (const record of records) {
      removeNodes(record.nodes)
    }

    records = []
  }, true)
}
