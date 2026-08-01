// packages/runtime-dom/src/list.ts

import { effect, onScopeDispose, stop } from '@zeus-js/signal/internal'

import { emitDevtoolsEvent } from './devtools'
import { captureScopedSubtreeContext, ScopedSubtree } from './scopedSubtree'

import type { JSXValue } from './types'

type Key = unknown

type ListRecord<T> = {
  key: Key
  item: T
  index: number
  subtree: ScopedSubtree
}

function disposeListRecord<T>(record: ListRecord<T>): void {
  record.subtree.dispose()
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
  const subtree = new ScopedSubtree(
    parent,
    marker,
    captureScopedSubtreeContext(),
  )

  const runner = effect(() => {
    const list = each() ?? []

    subtree.replace(() => list.map((item, index) => render(item, index)))
  })

  onScopeDispose(() => {
    stop(runner)
    subtree.dispose()
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
  const subtreeContext = captureScopedSubtreeContext()

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
        const subtree = new ScopedSubtree(parent, marker, subtreeContext)
        subtree.replace(() => render(item, i))

        nextRecords.push({
          key: itemKey,
          item,
          index: i,
          subtree,
        })
      }
    }

    for (const record of oldMap.values()) {
      disposeListRecord(record)
    }

    for (let i = nextRecords.length - 1; i >= 0; i--) {
      const record = nextRecords[i]
      const anchor =
        i === nextRecords.length - 1
          ? marker
          : (nextRecords[i + 1].subtree.current()[0] ?? marker)

      record.subtree.moveBefore(anchor)
    }

    emitDevtoolsEvent({ type: 'mount-for', length: nextRecords.length })

    records = nextRecords
  })

  onScopeDispose(() => {
    stop(runner)

    for (const record of records) {
      disposeListRecord(record)
    }

    records = []
  }, true)
}
