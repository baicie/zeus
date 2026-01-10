# Zeus 文档

## 快速开始

### 安装

```bash
npm install @zeus-js/runtime-core @zeus-js/runtime-dom
```

### 基础用法

```tsx
import { signal } from '@zeus-js/signal'
import { createApp } from '@zeus-js/runtime-core'

function Counter() {
  const count = signal(0)

  return () => {
    const div = document.createElement('div')
    const button = document.createElement('button')

    button.textContent = `Count: ${count()}`
    button.addEventListener('click', () => count(count() + 1))

    div.appendChild(button)
    return div
  }
}

const app = createApp(Counter)
app.mount('#app')
```

## 核心概念

- **无虚拟DOM**: 直接操作真实DOM元素
- **编译时优化**: 通过编译器实现精确的响应式更新
- **函数式编程**: 组件即函数，返回DOM元素

## 更多文档

- [指南](./guide/)
- [API 参考](./api/)
- [示例](./examples/)
