// packages/runtime-dom/src/list.ts

import {
  batch,
  createSignal,
  effect,
  onScopeDispose,
  stop,
  untrack,
} from '@zeus-js/signal/internal'

import { emitDevtoolsEvent } from './devtools'
import { captureScopedSubtreeContext, ScopedSubtree } from './scopedSubtree'

import type { JSXValue } from './types'
import type { Accessor, Setter } from '@zeus-js/signal'
import type { ReactiveEffectRunner } from '@zeus-js/signal/internal'

type Key = unknown

type ListEntry<T> = {
  item: T
  key: Key
}

type ListRecord<T> = {
  key: Key
  setItem: Setter<T>
  setIndex: Setter<number>
  subtree: ScopedSubtree
}

function disposeListRecord<T>(record: ListRecord<T>): void {
  record.subtree.dispose()
}

function isImmediatelyBefore<T>(record: ListRecord<T>, anchor: Node): boolean {
  const nodes = record.subtree.current()
  const last = nodes[nodes.length - 1]

  return last === undefined || last.nextSibling === anchor
}

function containsNode<T>(record: ListRecord<T>, node: Node): boolean {
  let current: Node | null = node

  while (current) {
    if (
      record.subtree
        .current()
        .some(root => root === current || root.contains(current))
    ) {
      return true
    }

    const treeRoot = current.getRootNode()
    current = 'host' in treeRoot ? (treeRoot as ShadowRoot).host : null
  }

  return false
}

function getDeepestActiveElement(parent: Node): Element | null {
  const treeRoot = parent.getRootNode()
  let active =
    'activeElement' in treeRoot
      ? (treeRoot as Document | ShadowRoot).activeElement
      : (parent.ownerDocument?.activeElement ?? null)

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }

  return active
}

function duplicateKeyError(key: Key, index: number): Error {
  return new Error(
    `[Zeus runtime] <For> received duplicate key ${String(key)} at index ${index}.`,
  )
}

export function mountFor<T, K = unknown>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: Accessor<T>, index: Accessor<number>) => JSXValue,
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
  render: (item: Accessor<T>, index: Accessor<number>) => JSXValue,
): void {
  const subtree = new ScopedSubtree(
    parent,
    marker,
    captureScopedSubtreeContext(),
  )
  let latestItems: readonly T[] = []
  let reconcileRequested = false
  let reconciling = false
  let disposed = false
  let runner: ReactiveEffectRunner | undefined

  const dispose = () => {
    if (disposed) return

    disposed = true
    if (runner) stop(runner)
    subtree.dispose()
  }

  onScopeDispose(dispose, true)

  const drainReconciliations = () => {
    if (disposed || reconciling) return

    reconciling = true
    try {
      while (reconcileRequested && !disposed) {
        reconcileRequested = false
        untrack(() => {
          subtree.replace(() =>
            latestItems.map((item, index) =>
              render(
                () => item,
                () => index,
              ),
            ),
          )
        })
      }
    } finally {
      reconciling = false
      if (disposed) subtree.dispose()
    }
  }

  const scheduleReconciliation = () => {
    if (disposed || !runner) return

    runner()
    if (disposed) return

    reconcileRequested = true
    drainReconciliations()
  }

  try {
    runner = effect(
      () => {
        const nextItems = each() ?? []
        for (let i = 0; i < nextItems.length; i++) {
          void nextItems[i]
        }
        latestItems = nextItems
      },
      { scheduler: scheduleReconciliation },
    )
  } catch (error) {
    dispose()
    throw error
  }

  if (disposed) {
    stop(runner)
    subtree.dispose()
    return
  }

  reconcileRequested = true
  try {
    drainReconciliations()
  } catch (error) {
    dispose()
    throw error
  }
}

function mountKeyedFor<T, K>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: (item: T, index: number) => K,
  render: (item: Accessor<T>, index: Accessor<number>) => JSXValue,
): void {
  let records: ListRecord<T>[] = []
  const subtreeContext = captureScopedSubtreeContext()
  let latestEntries: readonly ListEntry<T>[] = []
  let reconcileRequested = false
  let reconciling = false
  let disposed = false
  let runner: ReactiveEffectRunner | undefined

  const dispose = () => {
    if (disposed) return

    disposed = true
    if (runner) stop(runner)

    const currentRecords = records
    records = []
    for (const record of currentRecords) {
      disposeListRecord(record)
    }
  }

  onScopeDispose(dispose, true)

  const reconcile = (nextEntries: readonly ListEntry<T>[]) => {
    if (disposed) return

    const oldMap = new Map<Key, ListRecord<T>>()

    for (const record of records) {
      oldMap.set(record.key, record)
    }

    const nextRecords: ListRecord<T>[] = []
    const createdRecords: ListRecord<T>[] = []

    try {
      batch(() => {
        for (let i = 0; i < nextEntries.length; i++) {
          const { item, key: itemKey } = nextEntries[i]
          const oldRecord = oldMap.get(itemKey)

          if (oldRecord) {
            oldMap.delete(itemKey)
            oldRecord.setItem(() => item)
            oldRecord.setIndex(i)
            nextRecords.push(oldRecord)
          } else {
            const [readItem, setItem] = createSignal(item)
            const [readIndex, setIndex] = createSignal(i)
            const subtree = new ScopedSubtree(parent, marker, subtreeContext)
            const record = {
              key: itemKey,
              setItem,
              setIndex,
              subtree,
            }
            createdRecords.push(record)
            subtree.replace(() => render(readItem, readIndex))
            nextRecords.push(record)
          }

          if (disposed) break
        }
      })
    } catch (error) {
      for (const record of createdRecords) {
        disposeListRecord(record)
      }

      throw error
    }

    if (disposed) {
      for (const record of createdRecords) {
        disposeListRecord(record)
      }
      return
    }

    const activeElement = getDeepestActiveElement(parent)
    const shouldRestoreFocus = Boolean(
      activeElement &&
      nextRecords.some(record => containsNode(record, activeElement)),
    )

    let committed = false
    try {
      for (const record of oldMap.values()) {
        disposeListRecord(record)
      }

      if (disposed) {
        for (const record of createdRecords) {
          disposeListRecord(record)
        }
        return
      }

      records = nextRecords
      committed = true

      let moved = false
      let anchor = marker

      for (let i = nextRecords.length - 1; i >= 0; i--) {
        const record = nextRecords[i]

        if (!isImmediatelyBefore(record, anchor)) {
          record.subtree.moveBefore(anchor)
          moved = true
        }

        anchor = record.subtree.current()[0] ?? anchor
      }

      if (disposed) return

      if (moved && shouldRestoreFocus) {
        ;(
          activeElement as Element & {
            focus?: (options?: { preventScroll?: boolean }) => void
          }
        ).focus?.({ preventScroll: true })
      }

      if (!disposed) {
        emitDevtoolsEvent({ type: 'mount-for', length: nextRecords.length })
      }
    } catch (error) {
      if (!committed) {
        for (const record of createdRecords) {
          disposeListRecord(record)
        }
      }
      throw error
    }
  }

  const drainReconciliations = () => {
    if (reconciling) return

    reconciling = true
    try {
      while (reconcileRequested) {
        reconcileRequested = false
        untrack(() => reconcile(latestEntries))
      }
    } finally {
      reconciling = false
    }
  }

  const scheduleReconciliation = () => {
    if (disposed || !runner) return

    runner()
    if (disposed) return

    reconcileRequested = true
    drainReconciliations()
  }

  try {
    runner = effect(
      () => {
        const nextItems = each() ?? []
        const nextEntries: ListEntry<T>[] = []
        const nextKeys = new Set<Key>()

        for (let i = 0; i < nextItems.length; i++) {
          const item = nextItems[i]
          const itemKey = key(item, i)

          if (nextKeys.has(itemKey)) {
            throw duplicateKeyError(itemKey, i)
          }

          nextKeys.add(itemKey)
          nextEntries.push({ item, key: itemKey })
        }

        latestEntries = nextEntries
      },
      { scheduler: scheduleReconciliation },
    )
  } catch (error) {
    dispose()
    throw error
  }

  if (disposed) {
    stop(runner)
    return
  }

  reconcileRequested = true
  try {
    drainReconciliations()
  } catch (error) {
    dispose()
    throw error
  }
}
