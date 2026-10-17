import { createSignal } from '@zeus-js/zeus'
import { describe, expect, it } from 'vitest'

describe('application template', () => {
  it('uses the public Zeus signal API', () => {
    const [count, setCount] = createSignal(0)

    setCount(1)

    expect(count()).toBe(1)
  })
})
