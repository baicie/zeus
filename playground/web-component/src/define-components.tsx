import {
  adaptToWebComponent,
  createStoreWebComponent,
} from '@zeus-js/web-components'
import { defineStore } from '@zeus-js/store'
import type { Store } from '@zeus-js/store'

// Mock injectStore and provideStore for demo (they are not exported from zeus packages yet)
function injectStore<S = any>(): Store<S> | null {
  return null
}

function provideStore(_store: any): void {
  // no-op for demo
}

interface CounterProps {
  start?: string | number | null
  label?: string | null
}

function createCounterComponent() {
  return function Counter(props?: CounterProps): Node {
    const startRaw = props && props.start != null ? props.start : 0
    const start = typeof startRaw === 'number' ? startRaw : Number(startRaw)

    const prefix = (props && props.label) || 'count'

    // 尝试注入 Store（如果没有提供则使用本地 signal）
    const store = injectStore<{ count: number }>()

    if (store) {
      // 使用 Store 模式
      const state = store.$
      return (
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}
        >
          <span>
            {prefix}: {state.count}
          </span>
          <button
            onClick={() => {
              store.$patch({ count: (state.count || 0) + 1 })
            }}
          >
            inc
          </button>
        </div>
      )
    }

    return <div>No store available</div>
  }
}

// 创建共享的 Counter Store
const useSharedCounterStore = defineStore({
  name: 'shared-counter',
  state: {
    count: 0,
    name: 'shared-counter',
  } as { count: number; name: string },
  actions: {
    increment() {
      ;(this as any).count++
    },
    decrement() {
      ;(this as any).count--
    },
    reset() {
      ;(this as any).count = 0
    },
  },
})

export function defineWebComponents(): void {
  // 基础 Counter（无 Store）
  adaptToWebComponent(createCounterComponent(), {
    tagName: 'zeus-counter',
    shadow: false,
    observedAttributes: ['start', 'label'],
    attributeToProps(name, value, props) {
      if (name === 'start') {
        props.start = value
        return
      }
      if (name === 'label') {
        props.label = value
        return
      }
      ;(props as any)[name] = value
    },
  })

  // Shadow DOM 版本
  adaptToWebComponent(createCounterComponent(), {
    tagName: 'zeus-counter-shadow',
    shadow: true,
    observedAttributes: ['start', 'label'],
    attributeToProps(name, value, props) {
      if (name === 'start') {
        props.start = value
        return
      }
      if (name === 'label') {
        props.label = value
        return
      }
      ;(props as any)[name] = value
    },
  })

  // 使用 Store 的 Counter Provider（提供 Store）
  adaptToWebComponent(
    function CounterProvider(): Node {
      const store = useSharedCounterStore()

      // 提供 Store 给后代
      provideStore(store)

      return (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <span>Provider: {store.$.count}</span>
          <button
            onClick={() => {
              store.$patch({ count: store.$.count + 1 })
            }}
          >
            +1
          </button>
          <button onClick={() => store.$reset()}>Reset</button>
        </div>
      )
    },
    {
      tagName: 'zeus-counter-provider',
      shadow: false,
    },
  )

  // 使用 Store 的 Counter（消费 Store）
  adaptToWebComponent(createCounterComponent(), {
    tagName: 'zeus-counter-store',
    shadow: false,
    observedAttributes: ['start', 'label'],
    attributeToProps(name, value, props) {
      if (name === 'start') {
        props.start = value
        return
      }
      if (name === 'label') {
        props.label = value
        return
      }
      ;(props as any)[name] = value
    },
    // 通过 storeGetter 提供 Store
    storeGetter: useSharedCounterStore as any,
  })

  // 使用 createStoreWebComponent 的便捷方式
  createStoreWebComponent(
    'zeus-counter-easy',
    function CounterEasy(): Node {
      const store = useSharedCounterStore()
      return (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px',
            border: '1px solid #888',
            borderRadius: '4px',
            background: '#f5f5f5',
          }}
        >
          <span>Easy: {store.$.count}</span>
          <button
            onClick={() => {
              store.$patch({ count: store.$.count + 1 })
            }}
          >
            +1
          </button>
        </div>
      )
    },
    useSharedCounterStore as any,
    {
      shadow: false,
    },
  )
}

// 导出 Store 供外部使用
export { useSharedCounterStore }
