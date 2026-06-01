import { bench, describe } from 'vitest'

import { state } from '../dist/signal.esm-browser.prod'

describe('ref', () => {
  bench('create ref', () => {
    state(100)
  })

  {
    let i = 0
    const v = state(100)
    bench('write ref', () => {
      v.value = i++
    })
  }

  {
    const v = state(100)
    bench('read ref', () => {
      v.value
    })
  }

  {
    let i = 0
    const v = state(100)
    bench('write/read ref', () => {
      v.value = i++
      v.value
    })
  }
})
