import { bench } from 'vitest'

import { state } from '../dist/signal.esm-browser.prod'

bench('create reactive obj', () => {
  state({ a: 1 })
})

{
  const r = state({ a: 1 })
  bench('read reactive obj property', () => {
    r.a
  })
}

{
  let i = 0
  const r = state({ a: 1 })
  bench('write reactive obj property', () => {
    r.a = i++
  })
}
