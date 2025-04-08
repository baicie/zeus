# Zeus.js

一个轻量级、高性能的响应式前端框架。

## 特性

- 🚀 **轻量高效** - 小于 10KB 的运行时 (gzip)
- ⚡ **响应式** - 精确的细粒度更新
- 🎯 **编译优化** - 不需要虚拟 DOM 的编译优化
- 🔧 **Web Components** - 内置支持自定义元素
- 📦 **模块化** - 按需引入所需功能
- 🛠️ **类型安全** - 完整的 TypeScript 支持

## 安装

```bash
npm install zeus-js
# 或
yarn add zeus-js
# 或
pnpm add zeus-js
```

## 快速开始

```jsx
import { render, useState } from 'zeus-js'

function Counter() {
  const [count, setCount] = useState(0)
  
  return (
    <div>
      <h1>计数器: {count}</h1>
      <button onClick={() => setCount(count + 1)}>
        增加
      </button>
    </div>
  )
}

render(<Counter />, document.getElementById('app'))
```

## 示例

### 响应式状态

```jsx
import { useState, useEffect } from 'zeus-js'

function Timer() {
  const [seconds, setSeconds] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => s + 1)
    }, 1000)
    
    return () => clearInterval(interval)
  })
  
  return <div>已运行 {seconds} 秒</div>
}
```

### 组件列表

```jsx
import { For } from 'zeus-js'

function TodoList({ items }) {
  return (
    <ul>
      <For each={items}>
        {(item, index) => (
          <li>
            {index() + 1}. {item.text}
          </li>
        )}
      </For>
    </ul>
  )
}
```

### Web Components

```jsx
import { defineCustomElement } from '@zeus-js/web-components'

// 定义自定义元素
defineCustomElement('my-counter', () => {
  const [count, setCount] = useState(0)
  
  return (
    <div>
      <h2>Web Component 计数器: {count}</h2>
      <button onClick={() => setCount(count + 1)}>
        增加
      </button>
    </div>
  )
})

// 在任何地方使用
// <my-counter></my-counter>
```

## 文档

查看完整文档：[https://zeus-js.org](https://zeus-js.org)

## 许可证

MIT