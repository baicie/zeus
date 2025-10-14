# @zeus-js/wc

> 函数式 Web Components 库 - 基于响应式内核的现代前端组件解决方案

## ✨ 特性

- 🎯 **函数式编程** - 使用函数定义组件，而不是类
- 🪝 **Hooks 支持** - 类似 React Hooks 的 API
- ⚡ **响应式状态** - 基于 signals 的细粒度响应式系统
- 🏗️ **原生 DOM 操作** - 提供简洁的 DOM 创建和操作 API
- 🔧 **原生 Web Components** - 完全基于 Web Components 标准
- 📦 **轻量级** - 极小的运行时体积，高性能
- 🚫 **无编译依赖** - 不依赖 JSX 编译器，纯运行时解决方案

## 🚀 快速开始

### 安装

```bash
npm install @zeus-js/wc
# 或
pnpm add @zeus-js/wc
# 或
yarn add @zeus-js/wc
```

### 基本用法

```typescript
import {
  defineFunctionalWC,
  useState,
  useEffect,
  div,
  h2,
  button,
} from '@zeus-js/wc'

// 定义函数式组件
function Counter(props: { initialValue?: string }) {
  const count = useState(parseInt(props.initialValue || '0'))

  useEffect(() => {
    console.log(`Count changed to: ${count()}`)
  })

  // 使用 DOM 辅助函数创建元素
  const countSpan = span({
    styles: { color: '#007acc' },
    textContent: count().toString(),
  })

  return div({
    styles: { padding: '20px', border: '1px solid #ccc' },
    children: [
      h2({ textContent: 'Count: ' }),
      countSpan,
      button({
        textContent: 'Increment',
        events: {
          click: () => count(count() + 1),
        },
      }),
    ],
  })
}

// 注册为 Web Component
defineFunctionalWC('my-counter', Counter, {
  shadow: true,
  observedAttributes: ['initial-value'],
})
```

### 在 HTML 中使用

```html
<!DOCTYPE html>
<html>
  <head>
    <script type="module" src="./my-counter.js"></script>
  </head>
  <body>
    <my-counter initial-value="10"></my-counter>
  </body>
</html>
```

## 🏗️ DOM 辅助函数

提供简洁的 DOM 创建和操作 API：

```typescript
import { div, button, h2, span, createElement } from '@zeus-js/wc'

// 使用快捷函数
const container = div({
  styles: { padding: '20px' },
  children: [
    h2({ textContent: 'Title' }),
    button({
      textContent: 'Click me',
      events: { click: () => console.log('clicked') },
    }),
  ],
})

// 使用通用函数
const customElement = createElement({
  tagName: 'div',
  attributes: { class: 'my-class' },
  styles: { color: 'red' },
  textContent: 'Hello World',
})
```

### 可用的快捷函数

- `div()`, `button()`, `input()`, `span()`, `p()`
- `h1()`, `h2()`, `h3()`, `ul()`, `li()`
- `createElement()` - 通用元素创建函数

## 🪝 Hooks API

### useState

创建响应式状态：

```typescript
function MyComponent() {
  const count = useState(0)
  const [user, setUser] = useState(null)

  return jsx(
    'div',
    null,
    jsx('p', null, 'Count: ', count()),
    jsx('button', { onClick: () => count(count() + 1) }, 'Increment')
  )
}
```

### useComputed

创建计算属性：

```typescript
function MyComponent() {
  const count = useState(0)
  const doubleCount = useComputed(() => count() * 2)

  return jsx(
    'div',
    null,
    jsx('p', null, 'Count: ', count()),
    jsx('p', null, 'Double: ', doubleCount())
  )
}
```

### useEffect

处理副作用：

```typescript
function MyComponent() {
  const count = useState(0)

  useEffect(() => {
    console.log('Component mounted')
    return () => console.log('Component unmounted')
  }, [])

  useEffect(() => {
    document.title = `Count: ${count()}`
  })

  return jsx('div', null, 'Count: ', count())
}
```

### useRef

创建引用：

```typescript
function MyComponent() {
  const inputRef = useRef<HTMLInputElement>(null)

  const focusInput = () => {
    inputRef.current?.focus()
  }

  return jsx(
    'div',
    null,
    jsx('input', { ref: inputRef }),
    jsx('button', { onClick: focusInput }, 'Focus Input')
  )
}
```

### useCallback

创建稳定的回调函数：

```typescript
function MyComponent() {
  const count = useState(0)

  const handleClick = useCallback(() => {
    count(count() + 1)
  }, [count])

  return jsx('button', { onClick: handleClick }, 'Increment')
}
```

### useMemo

缓存计算结果：

```typescript
function MyComponent() {
  const [items, setItems] = useState([])

  const expensiveValue = useMemo(() => {
    return items().reduce((sum, item) => sum + item.value, 0)
  }, [items])

  return jsx('div', null, 'Total: ', expensiveValue())
}
```

## 🔧 配置选项

```typescript
defineFunctionalWC('my-component', MyComponent, {
  shadow: true, // 是否使用 Shadow DOM
  styles: `                        // 自定义样式
    :host {
      display: block;
    }
  `,
  observedAttributes: ['prop1', 'prop2'], // 观察的属性
  tagName: 'my-component', // 组件标签名
})
```

## 📚 示例

### 计数器组件

```typescript
import {
  defineFunctionalWC,
  useState,
  div,
  h2,
  button,
  span,
} from '@zeus-js/wc'

function Counter(props: { initialValue?: string; step?: string }) {
  const count = useState(parseInt(props.initialValue || '0'))
  const step = parseInt(props.step || '1')

  const countSpan = span({
    styles: { color: '#007acc', fontSize: '24px' },
    textContent: count().toString(),
  })

  return div({
    styles: { padding: '20px', border: '1px solid #ccc' },
    children: [
      h2({ textContent: 'Count: ' }),
      countSpan,
      div({
        styles: { display: 'flex', gap: '8px', marginTop: '16px' },
        children: [
          button({
            textContent: `+${step}`,
            events: { click: () => count(count() + step) },
          }),
          button({
            textContent: `-${step}`,
            events: { click: () => count(count() - step) },
          }),
          button({
            textContent: 'Reset',
            events: { click: () => count(0) },
          }),
        ],
      }),
    ],
  })
}

defineFunctionalWC('alien-counter', Counter, {
  shadow: true,
  observedAttributes: ['initial-value', 'step'],
})
```

### 待办事项列表

```typescript
import {
  defineFunctionalWC,
  useState,
  div,
  input,
  button,
  ul,
  li,
  span,
} from '@zeus-js/wc'

interface TodoItem {
  id: number
  text: string
  completed: boolean
}

function TodoList() {
  const todos = useState<TodoItem[]>([])
  const newTodo = useState('')

  const addTodo = () => {
    if (newTodo().trim()) {
      todos([
        ...todos(),
        {
          id: Date.now(),
          text: newTodo().trim(),
          completed: false,
        },
      ])
      newTodo('')
    }
  }

  const toggleTodo = (id: number) => {
    todos(
      todos().map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    )
  }

  const todoInput = input({
    attributes: { placeholder: 'Add a new todo...' },
    styles: { marginRight: '8px', padding: '8px' },
    events: {
      input: (e: Event) => newTodo((e.target as HTMLInputElement).value),
      keypress: (e: KeyboardEvent) => {
        if (e.key === 'Enter') addTodo()
      },
    },
  })

  const todoList = ul({
    styles: { listStyle: 'none', padding: 0 },
    children: todos().map(todo =>
      li({
        styles: {
          display: 'flex',
          alignItems: 'center',
          padding: '8px',
          borderBottom: '1px solid #eee',
        },
        children: [
          input({
            attributes: { type: 'checkbox' },
            events: { change: () => toggleTodo(todo.id) },
          }),
          span({
            styles: {
              marginLeft: '8px',
              textDecoration: todo.completed ? 'line-through' : 'none',
            },
            textContent: todo.text,
          }),
        ],
      })
    ),
  })

  return div({
    styles: { padding: '20px' },
    children: [
      div({
        styles: { marginBottom: '20px' },
        children: [
          todoInput,
          button({
            textContent: 'Add',
            events: { click: addTodo },
          }),
        ],
      }),
      todoList,
    ],
  })
}

defineFunctionalWC('alien-todo-list', TodoList, {
  shadow: true,
})
```

## 🎯 与类式组件的对比

| 特性     | 类式组件 | 函数式组件 |
| -------- | -------- | ---------- |
| 代码量   | 较多     | 更少       |
| 学习曲线 | 陡峭     | 平缓       |
| 状态管理 | 复杂     | 简单       |
| 生命周期 | 方法重写 | Hooks      |
| 类型推导 | 一般     | 更好       |
| 测试友好 | 一般     | 更好       |

## 🔗 相关链接

- [Zeus Runtime](../runtime) - 响应式内核
- [Zeus Compiler](../compiler) - JSX 编译器
- [示例项目](../../examples) - 更多示例

## 📄 许可证

MIT License
