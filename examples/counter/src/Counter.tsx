// examples/counter/src/Counter.tsx

import { signal } from '@zeus-js/signal'

function Counter() {
  const count = signal(0)
  const increment = () => count(count() + 1)

  return () => {
    const div = document.createElement('div')
    const h1 = document.createElement('h1')
    const button = document.createElement('button')

    // 响应式绑定：count 变化时自动更新文本
    // 这里需要实现effect来处理响应式更新
    h1.textContent = `Count: ${count()}`

    button.textContent = '+'
    button.addEventListener('click', increment)

    div.appendChild(h1)
    div.appendChild(button)

    return div
  }
}

export default Counter
