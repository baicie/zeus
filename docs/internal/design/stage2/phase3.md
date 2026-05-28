下面给你 **Phase C：Runtime 语义补强与稳定性测试** 的详细设计与代码草案。

Phase C 的目标不是继续扩新功能，而是把现有 runtime 的关键行为定死：

```txt
For keyed 怎么更新？
Show 切换怎么清理？
事件委托 currentTarget 是否正确？
ref 什么时候置空？
render dispose 后 effect 是否停止？
Web Component disconnected 后是否清理？
```

这一步做完，Zeus 才能从“Demo 能跑”进入“行为可预期”。

---

# Phase C 总目标

Phase C 目标：

```txt
1. 修正事件委托语义，尤其是 event.currentTarget
2. 明确 For keyed diff 行为边界
3. 强化 Show / mountDynamic 节点清理
4. 固定 ref 生命周期语义
5. 固定 render dispose 语义
6. 固定 Web Component connected/disconnected cleanup
7. 补 runtime-dom 单测
8. 补文档说明 runtime 行为边界
```

完成后要保证：

```txt
counter / todo / web-component examples 都稳定
runtime cleanup 测试稳定
事件处理器里 event.currentTarget 可用
scope.stop() 后事件/ref/effect/For 节点都被清理
```

---

# Phase C.1：事件委托语义补强

你现在 runtime 走事件委托是对的，但这里有一个很关键的问题：

```tsx
<input
  onInput={event => {
    event.currentTarget.value
  }}
/>
```

如果 `bindEvent()` 只是把 handler 存到元素上，然后 `document.addEventListener()` 统一派发，那么原生事件的 `currentTarget` 默认会是 `document`，不是实际绑定的 input。

所以 Phase C 第一优先级是修正：

```txt
handler(event) 里 event.currentTarget 必须等于绑定事件的元素
```

## 设计

`bindEvent(el, name, handler)` 仍然只存 handler：

```ts
el.__zeusEvents[name] = handler
```

`delegateEvents(['click', 'input'])` 在 document 上注册一次。

派发时从 `event.target` 往上找元素，如果元素上有 handler：

```ts
callDelegatedHandler(el, handler, event)
```

在调用 handler 前临时重写 `event.currentTarget`。

---

## 代码草案：`packages/runtime-dom/src/events.ts`

```ts
import { onScopeDispose } from '@zeus-js/signal'

type ZeusEventMap = Record<string, EventListener>

type ZeusElementWithEvents = Element & {
  __zeusEvents?: ZeusEventMap
}

const delegatedEvents = new Set<string>()

const nonBubblingEventMap: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
}

export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void {
  const target = el as ZeusElementWithEvents
  const events = (target.__zeusEvents ||= {})

  events[name] = handler

  onScopeDispose(() => {
    if (target.__zeusEvents?.[name] === handler) {
      delete target.__zeusEvents[name]
    }
  }, true)
}

export function delegateEvents(events: readonly string[]): void {
  for (const event of events) {
    const delegatedName = normalizeDelegatedEventName(event)

    if (delegatedEvents.has(delegatedName)) continue

    delegatedEvents.add(delegatedName)
    document.addEventListener(delegatedName, dispatchDelegatedEvent)
  }
}

function normalizeDelegatedEventName(name: string): string {
  return nonBubblingEventMap[name] ?? name
}

function dispatchDelegatedEvent(event: Event): void {
  const eventName = normalizeOriginalEventName(event.type)

  let node = event.target as Node | null

  while (node && node !== document) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as ZeusElementWithEvents
      const handler = el.__zeusEvents?.[eventName]

      if (handler) {
        callDelegatedHandler(el, handler, event)

        if (event.cancelBubble) {
          return
        }
      }
    }

    node = node.parentNode
  }
}

function normalizeOriginalEventName(name: string): string {
  if (name === 'focusin') return 'focus'
  if (name === 'focusout') return 'blur'
  return name
}

function callDelegatedHandler(
  el: Element,
  handler: EventListener,
  event: Event,
): void {
  const hadOwnCurrentTarget = Object.prototype.hasOwnProperty.call(
    event,
    'currentTarget',
  )

  const previousCurrentTarget = hadOwnCurrentTarget
    ? Object.getOwnPropertyDescriptor(event, 'currentTarget')
    : undefined

  try {
    Object.defineProperty(event, 'currentTarget', {
      configurable: true,
      get() {
        return el
      },
    })
  } catch {
    // Some environments may not allow redefining currentTarget.
    // handler.call(el, event) still gives function handlers `this === el`.
  }

  try {
    handler.call(el, event)
  } finally {
    try {
      if (previousCurrentTarget) {
        Object.defineProperty(event, 'currentTarget', previousCurrentTarget)
      } else {
        delete (event as unknown as { currentTarget?: EventTarget })
          .currentTarget
      }
    } catch {
      // ignore restore failure in non-browser test environments
    }
  }
}
```

## 为什么要处理 focus/blur？

`focus` 和 `blur` 不冒泡，事件委托监听 document 通常收不到，所以映射成：

```txt
focus -> focusin
blur  -> focusout
```

对用户仍然写：

```tsx
<input onFocus={...} onBlur={...} />
```

compiler 仍然注册 `focus / blur`，runtime 内部转成 `focusin / focusout`。

---

## 事件测试

新增：

```txt
packages/runtime-dom/__tests__/events.spec.ts
```

```ts
import { describe, expect, it, vi } from 'vitest'

import { scope } from '@zeus-js/signal'
import { bindEvent, delegateEvents } from '../src'

describe('delegated events', () => {
  it('sets currentTarget to the bound element', () => {
    const input = document.createElement('input')
    const fn = vi.fn((event: Event) => {
      expect(event.currentTarget).toBe(input)
    })

    document.body.appendChild(input)

    delegateEvents(['input'])
    bindEvent(input, 'input', fn)

    input.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
      }),
    )

    expect(fn).toHaveBeenCalledTimes(1)

    input.remove()
  })

  it('removes handler on scope stop', () => {
    const button = document.createElement('button')
    const fn = vi.fn()
    const s = scope()

    document.body.appendChild(button)
    delegateEvents(['click'])

    s.run(() => {
      bindEvent(button, 'click', fn)
    })

    button.click()
    expect(fn).toHaveBeenCalledTimes(1)

    s.stop()

    button.click()
    expect(fn).toHaveBeenCalledTimes(1)

    button.remove()
  })

  it('supports stopPropagation', () => {
    const parent = document.createElement('div')
    const child = document.createElement('button')

    const parentFn = vi.fn()
    const childFn = vi.fn((event: Event) => {
      event.stopPropagation()
    })

    parent.appendChild(child)
    document.body.appendChild(parent)

    delegateEvents(['click'])
    bindEvent(parent, 'click', parentFn)
    bindEvent(child, 'click', childFn)

    child.click()

    expect(childFn).toHaveBeenCalledTimes(1)
    expect(parentFn).not.toHaveBeenCalled()

    parent.remove()
  })

  it('supports focus and blur through focusin/focusout', () => {
    const input = document.createElement('input')
    const focusFn = vi.fn()

    document.body.appendChild(input)

    delegateEvents(['focus'])
    bindEvent(input, 'focus', focusFn)

    input.dispatchEvent(
      new FocusEvent('focusin', {
        bubbles: true,
      }),
    )

    expect(focusFn).toHaveBeenCalledTimes(1)

    input.remove()
  })
})
```

---

# Phase C.2：For keyed diff 语义补强

你当前 `mountFor()` 已经支持 keyed diff。Phase C 不建议立刻做复杂“同 key 替换 item 自动重渲染”的机制，因为这会牵涉 item signal、index signal、children lazy getter 等一整套设计。

Phase C 先明确两个层级：

```txt
C.2.1 当前支持：
  - 新增 item
  - 删除 item
  - 移动 item
  - reactive item 内部字段变更

C.2.2 当前不保证：
  - 同 key 普通对象整体替换后，旧 DOM 自动重新绑定到新对象
```

也就是说推荐写法：

```ts
todo.done = true
```

不推荐依赖：

```ts
todos[index] = {
  ...todo,
  done: true,
}
```

尤其在 key 不变时。

---

## 文档说明

新增：

```txt
docs/guide/control-flow.md
```

````md
# For

`For` supports keyed DOM reuse.

```tsx
<For each={todos} by={todo => todo.id}>
  {todo => <li>{todo.title}</li>}
</For>
```
````

## Recommended

Items should be reactive objects.

```ts
todo.done = true
```

## Limitation

Replacing an item with a new plain object using the same key may reuse the old DOM subtree. If you need full replacement behavior, change the key or mutate the reactive item.

````

---

## For 测试

新增：

```txt
packages/runtime-dom/__tests__/for.spec.ts
````

```ts
import { describe, expect, it } from 'vitest'

import { scope, state } from '@zeus-js/signal'
import { mountFor } from '../src'

describe('mountFor', () => {
  it('mounts initial items', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    const items = state([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ])

    parent.appendChild(marker)

    mountFor(
      parent,
      marker,
      () => items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    expect(parent.textContent).toBe('ab')
  })

  it('moves keyed items instead of recreating them', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    const items = state([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
      { id: 3, title: 'c' },
    ])

    parent.appendChild(marker)

    mountFor(
      parent,
      marker,
      () => items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        li.setAttribute('data-id', String(item.id))
        return li
      },
    )

    const firstNode = parent.querySelector('[data-id="1"]')

    items.reverse()

    expect(parent.textContent).toBe('cba')
    expect(parent.querySelector('[data-id="1"]')).toBe(firstNode)
  })

  it('removes disappeared keyed items', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    const items = state([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ])

    parent.appendChild(marker)

    mountFor(
      parent,
      marker,
      () => items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    items.splice(0, 1)

    expect(parent.textContent).toBe('b')
  })

  it('cleans list nodes when scope stops', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    const items = state([{ id: 1 }, { id: 2 }])

    const s = scope()
    parent.appendChild(marker)

    s.run(() => {
      mountFor(
        parent,
        marker,
        () => items,
        item => item.id,
        item => {
          const li = document.createElement('li')
          li.textContent = String(item.id)
          return li
        },
      )
    })

    expect(parent.querySelectorAll('li')).toHaveLength(2)

    s.stop()

    expect(parent.querySelectorAll('li')).toHaveLength(0)
    expect(parent.childNodes).toHaveLength(1)
    expect(parent.firstChild).toBe(marker)
  })
})
```

---

# Phase C.3：可选增强：For 同 key 替换支持

这一步可以作为 Phase C 的增强项，不一定现在做。

如果你想更强，可以给每个 record 包一个 `itemState`，这样同 key 替换时内部 getter 能拿到新值。

但有个问题：当前 render 函数里写的是：

```tsx
{
  todo => <span>{todo.title}</span>
}
```

如果 `todo` 是普通对象，即使你内部替换了 `record.item.value`，闭包里拿到的仍然是旧对象。

所以更可靠的增强方案是改 For render 参数，让 item 是 getter 或 reactive shell，但这会影响用户 API。

暂时不建议现在做。

---

# Phase C.4：Show / mountDynamic 清理语义

目标：

```txt
1. when true -> 渲染 children
2. when false -> 删除 children，渲染 fallback
3. 重复切换不会残留旧节点
4. scope.stop() 删除当前渲染的节点
```

如果你的 `mountDynamic()` 已经用了 `DynamicRange` 或类似 current nodes 管理，那么重点是补测试。

## 测试

```txt
packages/runtime-dom/__tests__/show.spec.ts
```

```ts
import { describe, expect, it } from 'vitest'

import { scope, state } from '@zeus-js/signal'
import { mountShow } from '../src'

describe('mountShow', () => {
  it('switches between children and fallback', () => {
    const visible = state(true)
    const parent = document.createElement('div')
    const marker = document.createComment('')

    parent.appendChild(marker)

    mountShow(
      parent,
      marker,
      () => visible.value,
      () => {
        const span = document.createElement('span')
        span.textContent = 'visible'
        return span
      },
      () => {
        const span = document.createElement('span')
        span.textContent = 'hidden'
        return span
      },
    )

    expect(parent.textContent).toBe('visible')

    visible.value = false
    expect(parent.textContent).toBe('hidden')

    visible.value = true
    expect(parent.textContent).toBe('visible')
  })

  it('does not keep stale nodes after many toggles', () => {
    const visible = state(true)
    const parent = document.createElement('div')
    const marker = document.createComment('')

    parent.appendChild(marker)

    mountShow(
      parent,
      marker,
      () => visible.value,
      () => {
        const span = document.createElement('span')
        span.textContent = 'visible'
        return span
      },
      () => null,
    )

    for (let i = 0; i < 10; i++) {
      visible.value = !visible.value
    }

    const spans = parent.querySelectorAll('span')

    expect(spans.length).toBe(1)
  })

  it('clears current nodes on scope stop', () => {
    const visible = state(true)
    const parent = document.createElement('div')
    const marker = document.createComment('')
    const s = scope()

    parent.appendChild(marker)

    s.run(() => {
      mountShow(
        parent,
        marker,
        () => visible.value,
        () => {
          const span = document.createElement('span')
          span.textContent = 'visible'
          return span
        },
      )
    })

    expect(parent.textContent).toBe('visible')

    s.stop()

    expect(parent.textContent).toBe('')
    expect(parent.childNodes).toHaveLength(1)
    expect(parent.firstChild).toBe(marker)
  })
})
```

---

# Phase C.5：ref 生命周期语义

目标：

```txt
1. bindRef(el, valueState) -> valueState.value = el
2. scope.stop() -> valueState.value = null
3. callback ref 初次传 el，dispose 时传 null
4. current object ref 初次 current = el，dispose current = null
```

## 测试

```txt
packages/runtime-dom/__tests__/refs.spec.ts
```

```ts
import { describe, expect, it, vi } from 'vitest'

import { scope, state } from '@zeus-js/signal'
import { bindRef } from '../src'

describe('bindRef', () => {
  it('sets and clears value state ref', () => {
    const input = state<HTMLInputElement | null>(null)
    const el = document.createElement('input')
    const s = scope()

    s.run(() => {
      bindRef(el, input)
    })

    expect(input.value).toBe(el)

    s.stop()

    expect(input.value).toBe(null)
  })

  it('sets and clears current object ref', () => {
    const ref = {
      current: null as HTMLInputElement | null,
    }

    const el = document.createElement('input')
    const s = scope()

    s.run(() => {
      bindRef(el, ref)
    })

    expect(ref.current).toBe(el)

    s.stop()

    expect(ref.current).toBe(null)
  })

  it('calls callback ref with element and null', () => {
    const fn = vi.fn()
    const el = document.createElement('input')
    const s = scope()

    s.run(() => {
      bindRef(el, fn)
    })

    expect(fn).toHaveBeenCalledWith(el)

    s.stop()

    expect(fn).toHaveBeenCalledWith(null)
  })
})
```

---

# Phase C.6：render dispose 语义

目标：

```txt
1. render 清空 container 并插入内容
2. dispose 后清空 container
3. dispose 后 effect 不再继续更新 DOM
4. 二次 dispose 不报错
```

## 测试

```txt
packages/runtime-dom/__tests__/render.spec.ts
```

```ts
import { describe, expect, it } from 'vitest'

import { state } from '@zeus-js/signal'
import { bindText, render } from '../src'

describe('render', () => {
  it('renders into container', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    render(el, container)

    expect(container.firstChild).toBe(el)
  })

  it('clears container on dispose', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    const dispose = render(el, container)

    expect(container.firstChild).toBe(el)

    dispose()

    expect(container.firstChild).toBe(null)
  })

  it('stops effects after dispose', () => {
    const container = document.createElement('div')
    const count = state(0)

    const dispose = render(() => {
      const text = document.createTextNode('')
      bindText(text, () => count.value)
      return text
    }, container)

    expect(container.textContent).toBe('0')

    dispose()

    count.value++

    expect(container.textContent).toBe('')
  })

  it('allows dispose to be called twice', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    const dispose = render(el, container)

    dispose()
    dispose()

    expect(container.firstChild).toBe(null)
  })
})
```

## 可选 runtime patch：让 dispose 幂等

如果当前 `render()` dispose 不是幂等，改成：

```ts
export function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
): () => void {
  const renderScope = scope()
  let disposed = false

  renderScope.run(() => {
    container.textContent = ''
    insert(container, resolveValue(value))
  })

  return () => {
    if (disposed) return
    disposed = true

    renderScope.stop()
    container.textContent = ''
  }
}
```

---

# Phase C.7：Web Component 生命周期语义

目标：

```txt
1. connectedCallback 渲染一次
2. disconnectedCallback dispose
3. attributeChangedCallback 更新 reactive props
4. disconnected 后 props 更新不再触发旧 DOM effect
5. light DOM Slot 不残留旧节点
```

## 测试

```txt
packages/runtime-dom/__tests__/custom-element.spec.tsx
```

```tsx
import { describe, expect, it, vi } from 'vitest'

import { Host, Slot, defineElement } from '../src'

describe('defineElement lifecycle', () => {
  it('renders props from attributes', () => {
    defineElement(
      'z-test-props',
      {
        shadow: false,
        props: {
          title: String,
        },
      },
      props => (
        <Host>
          <span>{props.title}</span>
        </Host>
      ),
    )

    const el = document.createElement('z-test-props')
    el.setAttribute('title', 'hello')

    document.body.appendChild(el)

    expect(el.textContent).toContain('hello')

    el.remove()
  })

  it('updates when attributes change', () => {
    defineElement(
      'z-test-attrs',
      {
        shadow: false,
        props: {
          title: String,
        },
      },
      props => (
        <Host>
          <span>{props.title}</span>
        </Host>
      ),
    )

    const el = document.createElement('z-test-attrs')
    el.setAttribute('title', 'hello')

    document.body.appendChild(el)

    expect(el.textContent).toContain('hello')

    el.setAttribute('title', 'world')

    expect(el.textContent).toContain('world')

    el.remove()
  })

  it('emits custom event', () => {
    defineElement(
      'z-test-emit',
      {
        shadow: false,
      },
      (_props, ctx) => (
        <Host>
          <button
            onClick={() => {
              ctx.emit('select', { id: 1 })
            }}
          >
            select
          </button>
        </Host>
      ),
    )

    const el = document.createElement('z-test-emit')
    const fn = vi.fn()

    el.addEventListener('select', fn)
    document.body.appendChild(el)

    el.querySelector('button')!.click()

    expect(fn).toHaveBeenCalledTimes(1)
    expect((fn.mock.calls[0][0] as CustomEvent).detail).toEqual({
      id: 1,
    })

    el.remove()
  })

  it('projects light DOM default slot', () => {
    defineElement(
      'z-test-slot-default',
      {
        shadow: false,
      },
      () => (
        <Host>
          <section>
            <Slot />
          </section>
        </Host>
      ),
    )

    const el = document.createElement('z-test-slot-default')
    const p = document.createElement('p')

    p.textContent = 'content'
    el.appendChild(p)

    document.body.appendChild(el)

    expect(el.querySelector('section')!.textContent).toContain('content')

    el.remove()
  })
})
```

---

# Phase C.8：runtime API 行为文档

新增：

```txt
docs/guide/runtime-semantics.md
```

内容建议：

````md
# Runtime Semantics

## Events

Zeus uses delegated events by default.

```tsx
<input onInput={event => event.currentTarget.value} />
```
````

`event.currentTarget` points to the element where the handler is declared.

## Refs

Refs are cleared when the owner scope is disposed.

```tsx
const input = state<HTMLInputElement | null>(null)

<input ref={input} />
```

When unmounted, `input.value` becomes `null`.

## Show

`Show` removes stale nodes when the condition changes.

## For

`For` reuses DOM nodes by key.

Items should be reactive objects. Replacing a plain object with the same key may reuse the old DOM subtree.

## render

`render()` returns a dispose function. Calling dispose clears the container and stops effects.

## Web Components

`defineElement()` disposes effects on `disconnectedCallback`.

````

---

# Phase C 推荐提交顺序

```txt
1. fix(runtime-dom): correct delegated event currentTarget
2. test(runtime-dom): add delegated event tests
3. test(runtime-dom): add ref lifecycle tests
4. test(runtime-dom): add render dispose tests
5. test(runtime-dom): add Show cleanup tests
6. test(runtime-dom): add For keyed semantics tests
7. test(runtime-dom): add custom element lifecycle tests
8. docs(runtime): document runtime semantics and For limitation
````

---

# Phase C 完成标准

Phase C 完成后，应该满足：

```txt
1. 事件委托里 event.currentTarget 正确
2. stopPropagation 能阻止父级 delegated handler
3. focus/blur 有明确处理
4. ref 在 scope dispose 时清空
5. render dispose 幂等并清理 effect
6. Show 切换不残留旧节点
7. For keyed 支持增删移动，并明确同 key 替换边界
8. Web Component disconnected 后清理 runtime effects
9. runtime-dom 的关键语义都有测试
10. docs/runtime-semantics.md 说明行为边界
```

---

# 最终结论

Phase C 是 Zeus 从“功能可用”到“行为可信”的阶段。

最优先做的是：

```txt
事件委托 currentTarget 修复
```

因为你的示例里大量使用：

```tsx
event.currentTarget.value
event.currentTarget.checked
```

如果 currentTarget 不对，input、checkbox、form 这些都会有隐性问题。

然后补：

```txt
ref / render / Show / For / Web Component cleanup 测试
```

这批完成后，Zeus 的 runtime 层就可以认为进入 MVP 稳定状态。
