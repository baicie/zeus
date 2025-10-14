/**
 * 简单的 JSX 示例
 * 展示 Zeus 编译器的转换能力
 */

import React from 'react'

function App() {
  const name = 'Zeus'
  const isVisible = true
  const count = 0

  return (
    <div className={isVisible ? 'visible' : 'hidden'}>
      <h1>Hello {name}!</h1>
      <p>Count: {count}</p>
      <button
        onClick={() => console.log('Button clicked!')}
        disabled={count === 0}
      >
        Click me
      </button>
      {isVisible && <div>This is visible</div>}
    </div>
  )
}

export default App
