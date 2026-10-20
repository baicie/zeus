'use client'

import { useState } from 'react'

import { ZNextCounter } from '../dist/react/index.js'

export function InteractiveCounter() {
  const [count, setCount] = useState(1)
  return (
    <section aria-label="客户端交互">
      <ZNextCounter
        count={count}
        onValueChange={event => setCount(event.detail.value)}
      >
        交互计数
      </ZNextCounter>
      <output aria-label="React 状态">{count}</output>
    </section>
  )
}
