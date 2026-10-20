import { createElement } from 'react'

import { InteractiveCounter } from './interactive-counter'

export default function Page() {
  return (
    <main>
      <h1>Zeus / Next.js 边界示例</h1>
      <section aria-label="服务端静态宿主">
        {createElement('z-next-counter', { count: 2 }, '服务端内容')}
        <p>原始宿主标签和可串行化属性由 Server Component 输出。</p>
      </section>
      <InteractiveCounter />
    </main>
  )
}
