import { batch, createRoot, effect, state } from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { bench, describe, expect, vi } from 'vitest'

// Share the source-level signal engine with mountFor. The browser bundle
// contains its own engine and cannot subscribe to this benchmark's state.
import { mountFor } from '../src/list'

type Item = { id: number; title: string }

type ListFixture = {
  parent: HTMLElement
  list: Item[]
  initialNodes: Element[]
  mount: () => void
  dispose: () => void
}

const makeItems = (length: number): Item[] =>
  Array.from({ length }, (_, id) => ({ id, title: `item ${id}` }))

function listBenchmark(
  name: string,
  length: number,
  keyed: boolean,
  expectedIds: readonly number[],
  update?: (list: Item[]) => void,
): void {
  let dom: JSDOM
  let fixture: ListFixture | undefined

  bench(
    name,
    () => {
      if (update) update(fixture!.list)
      else fixture!.mount()
    },
    {
      throws: true,
      // Tinybench's per-iteration hooks surround, but are outside, its timer.
      // Update samples measure only the mutation; mounting is fixture setup.
      setup(task) {
        dom = new JSDOM('<!doctype html><html><body></body></html>')
        vi.stubGlobal('document', dom.window.document)
        vi.stubGlobal('Node', dom.window.Node)

        task.opts.beforeEach = () => {
          const parent = document.createElement('ul')
          const marker = document.createComment('')
          parent.appendChild(marker)
          const list = state(makeItems(length))
          let dispose = () => {}

          fixture = {
            parent,
            list,
            initialNodes: [],
            mount() {
              createRoot(disposeRoot => {
                dispose = disposeRoot
                mountFor(
                  parent,
                  marker,
                  () => list,
                  keyed ? item => item.id : undefined,
                  (item, index) => {
                    const li = document.createElement('li')
                    effect(() => {
                      li.dataset.id = String(item().id)
                      li.dataset.index = String(index())
                      li.textContent = item().title
                    })
                    return li
                  },
                )
              })
            },
            dispose: () => dispose(),
          }

          if (update) {
            fixture.mount()
            fixture.initialNodes = Array.from(parent.children)
          }
        }

        task.opts.afterEach = () => {
          const current = fixture!
          try {
            const nodes = Array.from(current.parent.children)
            expect(
              nodes.map(node => Number((node as HTMLElement).dataset.id)),
            ).toEqual(expectedIds)
            expect(nodes.map(node => node.textContent)).toEqual(
              expectedIds.map(id => `item ${id}`),
            )
            expect(
              nodes.map(node => (node as HTMLElement).dataset.index),
            ).toEqual(expectedIds.map((_, index) => String(index)))
            if (keyed && update) {
              for (let i = 0; i < nodes.length; i++) {
                const initial = current.initialNodes[expectedIds[i]]
                if (initial) expect(nodes[i]).toBe(initial)
              }
            }
          } finally {
            current.dispose()
          }
          expect(current.parent.childNodes).toHaveLength(1)
        }
      },
      teardown() {
        fixture?.dispose()
        dom.window.close()
        vi.unstubAllGlobals()
      },
    },
  )
}

describe('keyed For', () => {
  for (const length of [100, 1000]) {
    const ids = makeItems(length).map(item => item.id)
    listBenchmark(`create ${length} items`, length, true, ids)
    listBenchmark(
      `move ${length} items reverse`,
      length,
      true,
      [...ids].reverse(),
      // Reverse writes several indices; publish the new key order atomically.
      list => batch(() => list.reverse()),
    )
  }

  listBenchmark(
    'append 100 items',
    0,
    true,
    makeItems(100).map(item => item.id),
    list => {
      for (const item of makeItems(100)) list.push(item)
    },
  )
  listBenchmark(
    'splice 100 items (remove middle 10)',
    100,
    true,
    makeItems(100)
      .map(item => item.id)
      .filter(id => id < 45 || id >= 55),
    list => list.splice(45, 10),
  )
})

describe('index For (no key)', () => {
  for (const length of [100, 1000]) {
    listBenchmark(
      `create ${length} items (index)`,
      length,
      false,
      makeItems(length).map(item => item.id),
    )
  }
})
