import { state } from '@zeus-js/signal'
import { bench, describe } from 'vitest'

import { mountFor } from '../dist/runtime-dom.esm-browser.prod'

describe('keyed For', () => {
  bench('create 100 items', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 100 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )
  })

  bench('create 1000 items', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 1000 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )
  })

  bench('move 100 items reverse', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 100 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    list.reverse()
  })

  bench('move 1000 items reverse', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 1000 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    list.reverse()
  })

  bench('append 100 items', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state<{ id: number; title: string }[]>([])

    mountFor(
      parent,
      marker,
      () => list,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    for (let i = 0; i < 100; i++) {
      list.push({ id: i, title: `item ${i}` })
    }
  })

  bench('splice 100 items (remove middle 10)', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 100 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    list.splice(45, 10)
  })
})

describe('index For (no key)', () => {
  bench('create 100 items (index)', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 100 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      undefined,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )
  })

  bench('create 1000 items (index)', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 1000 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      undefined,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )
  })
})
