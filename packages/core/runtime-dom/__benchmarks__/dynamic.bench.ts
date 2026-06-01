import { state } from '@zeus-js/signal'
import { bench, describe } from 'vitest'

import { mountDynamic } from '../dist/runtime-dom.esm-browser.prod'

describe('mountDynamic', () => {
  bench('mount dynamic text', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const value = state('hello')

    mountDynamic(parent, marker, () => value.value)
  })

  bench('mount dynamic element', () => {
    const parent = document.createElement('div')
    const marker = document.createElement('div')
    parent.appendChild(marker)

    const value = state<HTMLElement | null>(null)

    mountDynamic(parent, marker, () => value.value)
  })

  bench('toggle between two values', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const flag = state(true)
    const content = state('A')

    mountDynamic(parent, marker, () => (flag.value ? content.value : null))

    for (let i = 0; i < 10; i++) {
      flag.value = !flag.value
    }
  })

  bench('switch between 5 values', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const idx = state(0)

    mountDynamic(parent, marker, () => ['A', 'B', 'C', 'D', 'E'][idx.value])

    for (let i = 0; i < 5; i++) {
      idx.value = i
    }
  })

  bench('dynamic text updates 100 times', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const value = state(0)

    mountDynamic(parent, marker, () => String(value.value))

    for (let i = 0; i < 100; i++) {
      value.value = i
    }
  })
})

describe('mountShow (via mountDynamic)', () => {
  bench('toggle show/hide 100 times', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const visible = state(true)
    const text = state('content')

    mountDynamic(parent, marker, () => (visible.value ? text.value : null))

    for (let i = 0; i < 100; i++) {
      visible.value = !visible.value
    }
  })
})

describe('DynamicRange.replace', () => {
  bench('replace with text 100 times', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const value = state('0')

    mountDynamic(parent, marker, () => value.value)

    for (let i = 0; i < 100; i++) {
      value.value = String(i)
    }
  })

  bench('replace with element 100 times', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const value = state<HTMLElement | null>(null)

    mountDynamic(parent, marker, () => value.value)

    for (let i = 0; i < 100; i++) {
      const el = document.createElement('span')
      el.textContent = String(i)
      value.value = el
    }
  })

  bench('replace with array 100 times', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const value = state<string[]>([])

    mountDynamic(parent, marker, () => value.value)

    for (let i = 0; i < 100; i++) {
      value.value = Array.from({ length: 5 }, (_, j) => `item ${i * 5 + j}`)
    }
  })
})
