import { customElement, noShadowDOM } from 'solid-element'
import { createEffect, createSignal } from 'solid-js'

// 定义 Props 类型
interface CounterProps {
  start?: number | string
  label?: string
}

// 创建带 props 的组件 - Light DOM 版本
// solid-element 组件函数签名: (props, { element, ... }) => JSX
const CounterComponent = (props: { start: number; label: string }) => {
  const [count, setCount] = createSignal(props.start)

  createEffect(() => {
    setCount(props.start)
  })

  const increment = () => setCount(c => c + 1)
  const decrement = () => setCount(c => c - 1)
  const reset = () => setCount(props.start)

  // 禁用 Shadow DOM
  noShadowDOM()

  return (
    <div
      style={{
        display: 'inline-flex',
        'align-items': 'center',
        gap: '10px',
        padding: '10px',
        border: '1px solid #4CAF50',
        'border-radius': '4px',
        background: '#f9f9f9',
      }}
    >
      <span>
        {props.label}: {count()}
      </span>
      <button
        onClick={increment}
        style={{
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          'border-radius': '3px',
          cursor: 'pointer',
        }}
      >
        +1
      </button>
      <button
        onClick={decrement}
        style={{
          background: '#f44336',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          'border-radius': '3px',
          cursor: 'pointer',
        }}
      >
        -1
      </button>
      <button
        onClick={reset}
        style={{
          background: '#9e9e9e',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          'border-radius': '3px',
          cursor: 'pointer',
        }}
      >
        Reset
      </button>
    </div>
  )
}

// 注册 Web Component (Light DOM 版本)
customElement('solid-counter', { start: 0, label: 'count' }, CounterComponent)

// 创建 Shadow DOM 版本
const ShadowCounterComponent = (props: { start: number; label: string }) => {
  const [count, setCount] = createSignal(props.start)

  createEffect(() => {
    setCount(props.start)
  })

  const increment = () => setCount(c => c + 1)
  const decrement = () => setCount(c => c - 1)
  const reset = () => setCount(props.start)

  // 默认使用 Shadow DOM，不需要调用 noShadowDOM()

  return (
    <div
      style={{
        display: 'inline-flex',
        'align-items': 'center',
        gap: '10px',
        padding: '10px',
        border: '1px solid #2196F3',
        'border-radius': '4px',
        background: '#e3f2fd',
      }}
    >
      <span>
        Shadow - {props.label}: {count()}
      </span>
      <button
        onClick={increment}
        style={{
          background: '#2196F3',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          'border-radius': '3px',
          cursor: 'pointer',
        }}
      >
        +1
      </button>
      <button
        onClick={decrement}
        style={{
          background: '#f44336',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          'border-radius': '3px',
          cursor: 'pointer',
        }}
      >
        -1
      </button>
      <button
        onClick={reset}
        style={{
          background: '#9e9e9e',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          'border-radius': '3px',
          cursor: 'pointer',
        }}
      >
        Reset
      </button>
    </div>
  )
}

// 注册 Shadow DOM 版本
customElement(
  'solid-counter-shadow',
  { start: 0, label: 'count' },
  ShadowCounterComponent,
)

// 导出用于 TypeScript 类型定义
export type { CounterProps }
export { CounterComponent, ShadowCounterComponent }
