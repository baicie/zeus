下面给你 **Phase A：MVP 稳定化** 的详细设计与代码草案。

Phase A 的目标不是继续加大功能，而是把现有技术闭环稳定下来：

```txt
state()
  ↓
TSX
  ↓
vite-plugin
  ↓
compiler physical DOM path
  ↓
runtime-dom insert/bind/mount
  ↓
examples 正常运行
```

你现在代码里已经有完整工程脚本、workspace、docs、examples、changeset、bench/size 等基础设施；compiler 也已经接入 `assignPhysicalDomPaths()`，并且 `emitElement()` 已经做了 DOM ref 依赖闭包。

# Phase A 总目标

Phase A 完成后，要满足：

```txt
1. examples/counter 可稳定运行
2. compiler 不再生成缺失变量，例如 _el$2 is not defined
3. physical DOM path 有 snapshot 回归测试
4. state(Map/Set) 类型和运行时行为一致
5. Vite plugin 编译 TSX + delegated events 正常
6. runtime-dom cleanup 行为可测试
7. 至少有 counter / todo / web-component 三个 smoke examples
```

我建议 Phase A 拆成 7 个任务：

```txt
A1. 修 state(Map/Set) 类型不一致
A2. lowerExpression 里 DynamicText ref 命名从 text$ 改 anchor$
A3. 补 compiler physicalDomPath snapshot
A4. 跑通并固定 examples/counter
A5. 新增 examples/todo，覆盖 For keyed
A6. 新增 examples/web-component，覆盖 defineElement + Slot
A7. 补 runtime cleanup 测试
```

---

# A1：修 `state(Map/Set)` 类型不一致

## 当前问题

`state.ts` 运行时会把 `Map / Set / WeakMap / WeakSet` 判定为可代理对象：

```ts
value instanceof Map ||
  value instanceof Set ||
  value instanceof WeakMap ||
  value instanceof WeakSet
```

但类型层面的 `ProxyableInput` 目前只包含：

```ts
Record<PropertyKey, any> | readonly any[]
```

这会导致：

```ts
const map = state(new Map<string, number>())
```

运行时是 reactive map，但 TS 类型可能被推成 `ValueState<Map<...>>`。

## 修改目标

让类型和运行时保持一致。

## 代码草案

文件：

```txt
packages/signal/src/state.ts
```

替换类型定义：

```ts
import { reactive } from './reactive'
import { ref } from './ref'

export interface ValueState<T = unknown> {
  get value(): T
  set value(value: T)
}

type AnyMap = Map<unknown, unknown> | WeakMap<object, unknown>

type AnySet = Set<unknown> | WeakSet<object>

type ProxyableInput =
  | Record<PropertyKey, any>
  | readonly any[]
  | AnyMap
  | AnySet

type ValueStateInput =
  | null
  | undefined
  | Date
  | RegExp
  | Error
  | Promise<any>
  | Function
  | Node

type Reactive<T extends object> = T

export type State<T> = T extends ValueStateInput
  ? ValueState<T>
  : T extends ProxyableInput
    ? Reactive<T>
    : ValueState<T>

export function state<T extends ValueStateInput>(value: T): ValueState<T>
export function state<T extends ProxyableInput>(value: T): Reactive<T>
export function state<T>(value: T): ValueState<T>
export function state<T = undefined>(): ValueState<T | undefined>
export function state(value?: unknown): unknown {
  if (arguments.length === 0) {
    return ref()
  }

  return isProxyable(value) ? reactive(value as object) : ref(value)
}
```

`isProxyable()` 可以保持你现在的实现。

## 测试草案

新增：

```txt
packages/signal/src/__tests__/state.spec.ts
```

或放你现在已有测试目录下：

```ts
import { describe, expect, it } from 'vitest'

import { isValueState, state } from '../state'

describe('state', () => {
  it('creates value state for primitive values', () => {
    const count = state(0)

    expect(isValueState(count)).toBe(true)
    expect(count.value).toBe(0)

    count.value++
    expect(count.value).toBe(1)
  })

  it('creates reactive state for plain objects', () => {
    const user = state({
      name: 'Zeus',
    })

    expect(user.name).toBe('Zeus')

    user.name = 'ZeusJS'

    expect(user.name).toBe('ZeusJS')
  })

  it('creates reactive state for Map', () => {
    const map = state(new Map<string, number>())

    map.set('a', 1)

    expect(map.get('a')).toBe(1)
  })

  it('creates reactive state for Set', () => {
    const set = state(new Set<number>())

    set.add(1)

    expect(set.has(1)).toBe(true)
  })

  it('creates value state for Date', () => {
    const now = new Date()
    const date = state(now)

    expect(isValueState(date)).toBe(true)
    expect(date.value).toBe(now)
  })
})
```

---

# A2：`DynamicText` 生成 ref 从 `text$` 改成 `anchor$`

## 当前问题

`emitDynamicText()` 里现在已经把 `DynamicTextIR.ref` 当作 comment anchor 使用，真实文本节点是临时 `textRef`。

但是 `lowerExpression()` 里创建 `DynamicTextIR` 时仍然用类似：

```ts
context.uid('text$')
```

语义上容易误导。之前你已经把 architecture 改成：

```txt
DynamicTextIR.ref = 模板里的 comment anchor
emit 阶段临时创建 Text 节点
```

所以命名应该同步成 `anchor$`。

## 修改草案

文件：

```txt
packages/compiler/src/lower/lowerExpression.ts
```

将：

```ts
return dynamicTextIR(expr, ref(context.uid('text$').name), hasOnceMarker(expr))
```

改成：

```ts
return dynamicTextIR(
  expr,
  ref(context.uid('anchor$').name),
  hasOnceMarker(expr),
)
```

这个不是功能性修复，但能避免后续维护时误判。

---

# A3：补 compiler physicalDomPath snapshot

这是 Phase A 最重要的测试。

现在 compiler 已经有：

```txt
assignDomPaths()
assignPhysicalDomPaths()
analyzeBindings()
collectTemplates()
```

并且 `PhysicalDomPath` 也已经进入 IR。

`assignPhysicalDomPaths()` 当前会基于真实模板子节点顺序生成：

```txt
FirstChild
NextSibling
ChildNode
```

其中 Text 节点会作为 `TextPlaceholder` 计入 childNodes 索引。

所以必须用 snapshot 防止回归。

## 新增测试文件

```txt
packages/compiler/__tests__/physical-dom-path.spec.ts
```

代码草案：

```ts
import { describe, expect, it } from 'vitest'
import { transformAsync } from '@babel/core'

import zeusCompiler from '../src'

async function compile(code: string): Promise<string> {
  const result = await transformAsync(code, {
    filename: 'test.tsx',
    sourceMaps: false,
    plugins: [
      [
        zeusCompiler,
        {
          moduleName: '@zeus-js/runtime-dom',
          generate: 'dom',
          hydratable: false,
          delegateEvents: true,
        },
      ],
    ],
    parserOpts: {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    },
    generatorOpts: {
      compact: false,
      retainLines: false,
    },
  })

  return result?.code ?? ''
}

describe('compiler physical DOM path', () => {
  it('compiles counter without marker lookup and missing previous refs', async () => {
    const code = `
      import { state } from '@zeus-js/zeus'

      function Counter() {
        const count = state(0)

        return (
          <div class="card">
            <h1>Counter</h1>
            <div class="count">{count.value}</div>
            <div class="buttons">
              <button onClick={() => count.value--}>-</button>
              <button onClick={() => count.value++}>+</button>
            </div>
          </div>
        )
      }
    `

    const output = await compile(code)

    expect(output).not.toContain('_marker(')
    expect(output).toContain('firstChild')
    expect(output).toContain('nextSibling')
    expect(output).toContain('delegateEvents')
    expect(output).toMatchSnapshot()
  })

  it('accounts for text node placeholders', async () => {
    const code = `
      const App = props => (
        <div>
          hello
          {props.name}
        </div>
      )
    `

    const output = await compile(code)

    expect(output).toContain('childNodes')
    expect(output).not.toContain('_marker(')
    expect(output).toMatchSnapshot()
  })

  it('declares all anchors before insert calls', async () => {
    const code = `
      const App = props => (
        <div>
          {props.a}
          {props.b}
          {props.c}
        </div>
      )
    `

    const output = await compile(code)

    const firstInsert = output.indexOf('_insert(')
    const beforeFirstInsert = output.slice(0, firstInsert)

    expect(firstInsert).toBeGreaterThan(0)
    expect(beforeFirstInsert).toContain('firstChild')
    expect(beforeFirstInsert).toContain('nextSibling')
    expect(output).toMatchSnapshot()
  })

  it('compiles nested dynamic text paths', async () => {
    const code = `
      const App = props => (
        <div>
          <section>
            <span>{props.name}</span>
          </section>
        </div>
      )
    `

    const output = await compile(code)

    expect(output).toContain('firstChild')
    expect(output).not.toContain('_marker(')
    expect(output).toMatchSnapshot()
  })

  it('compiles Show and For anchors with physical paths', async () => {
    const code = `
      const App = props => (
        <div>
          <Show when={props.visible}>
            <span>visible</span>
          </Show>

          <For each={props.items} by={item => item.id}>
            {item => <span>{item.name}</span>}
          </For>
        </div>
      )
    `

    const output = await compile(code)

    expect(output).toContain('_mountShow')
    expect(output).toContain('_mountFor')
    expect(output).not.toContain('_marker(')
    expect(output).toMatchSnapshot()
  })
})
```

## 验收点

这些测试通过后，说明：

```txt
1. 不依赖 runtime marker(parent,index)
2. anchor 在 insert 前声明
3. Text 节点计入 childNodes index
4. NextSibling 依赖闭包没有漏变量
5. Show / For anchor 也走 physical path
```

---

# A4：固定 `examples/counter`

你现在已经有 counter example：

```tsx
import { render, state } from '@zeus-js/zeus'

function Counter() {
  const count = state(0)

  return (
    <div class="card">
      <h1>Counter</h1>
      <div class="count">{count.value}</div>
      <div class="buttons">
        <button onClick={() => count.value--}>-</button>
        <button onClick={() => count.value++}>+</button>
      </div>
    </div>
  )
}

render(() => <Counter />, document.getElementById('root')!)
```

这正好是 physical DOM path 的回归样本，因为它有静态 `<h1>`、动态 text、兄弟按钮事件。

## 建议补一个 smoke test

可以新增：

```txt
examples/counter/src/main.test.ts
```

但更好是放到 runtime/browser e2e 里。MVP 阶段可以先用 Puppeteer smoke：

```txt
examples/counter/__tests__/counter.e2e.ts
```

代码草案：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import puppeteer, { type Browser, type Page } from 'puppeteer'

let server: ChildProcess
let browser: Browser
let page: Page

describe('examples/counter', () => {
  beforeAll(async () => {
    server = spawn(
      'pnpm',
      ['-C', 'examples/counter', 'dev', '--host', '127.0.0.1'],
      {
        stdio: 'inherit',
        shell: true,
      },
    )

    browser = await puppeteer.launch({
      headless: true,
    })

    page = await browser.newPage()

    await page.goto('http://127.0.0.1:5173', {
      waitUntil: 'networkidle0',
    })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    server?.kill()
  })

  it('increments and decrements count', async () => {
    await expect(page.$eval('.count', el => el.textContent)).resolves.toContain(
      '0',
    )

    await page.click('button:nth-of-type(2)')
    await expect(page.$eval('.count', el => el.textContent)).resolves.toContain(
      '1',
    )

    await page.click('button:nth-of-type(1)')
    await expect(page.$eval('.count', el => el.textContent)).resolves.toContain(
      '0',
    )
  })
})
```

如果不想现在上 e2e，至少要把 counter 的编译产物纳入 compiler snapshot。

---

# A5：新增 `examples/todo`，覆盖 For keyed

## 目标

覆盖：

```txt
1. state(array)
2. For each + by
3. input prop:value
4. onInput / onClick
5. reactive item.done
```

## 文件结构

```txt
examples/todo/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/main.tsx
```

## package.json

```json
{
  "name": "@zeus-js/example-todo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@zeus-js/zeus": "workspace:*"
  },
  "devDependencies": {
    "@zeus-js/vite-plugin": "workspace:*",
    "typescript": "^6.0.3",
    "vite": "catalog:"
  }
}
```

## vite.config.ts

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"],
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

## src/main.tsx

```tsx
import { For, render, state } from '@zeus-js/zeus'

type Todo = {
  id: number
  title: string
  done: boolean
}

function App() {
  const title = state('')
  const todos = state<Todo[]>([
    {
      id: 1,
      title: 'Learn Zeus',
      done: false,
    },
  ])

  function addTodo() {
    const value = title.value.trim()

    if (!value) return

    todos.push({
      id: Date.now(),
      title: value,
      done: false,
    })

    title.value = ''
  }

  return (
    <main>
      <h1>Todo</h1>

      <input
        prop:value={title.value}
        onInput={event => {
          title.value = event.currentTarget.value
        }}
      />

      <button onClick={addTodo}>Add</button>

      <ul>
        <For each={todos} by={todo => todo.id}>
          {todo => (
            <li class={{ done: todo.done }}>
              <label>
                <input
                  type="checkbox"
                  prop:checked={todo.done}
                  onChange={event => {
                    todo.done = event.currentTarget.checked
                  }}
                />

                <span>{todo.title}</span>
              </label>
            </li>
          )}
        </For>
      </ul>
    </main>
  )
}

render(() => <App />, document.getElementById('root')!)
```

## 重要说明

当前 `mountFor()` 同 key 复用 DOM，如果你替换同 key 的普通对象，旧 DOM 不一定会重新 render，因为 current keyed diff 只是更新 `oldRecord.item` 和 `oldRecord.index`。

所以 Todo 例子应该使用：

```ts
todo.done = true
```

这种 reactive item 内部 mutation，而不是：

```ts
todos[index] = { ...todo, done: true }
```

这个边界要在文档中说明。

---

# A6：新增 `examples/web-component`

## 目标

覆盖：

```txt
defineElement()
Host
Slot
props attribute -> reactive props
ctx.emit()
light DOM slot
```

runtime-dom 当前已经导出 `defineElement / Host / Slot / createSlot / hostContext`，具备这个 example 的基础。

## 文件结构

```txt
examples/web-component/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/main.tsx
```

## src/main.tsx

```tsx
import { Host, Slot, defineElement, state } from '@zeus-js/zeus'

defineElement(
  'z-counter-card',
  {
    shadow: false,
    props: {
      title: String,
      active: Boolean,
    },
  },
  (props, ctx) => {
    const count = state(0)

    return (
      <Host>
        <article class={{ active: props.active }}>
          <h2>{props.title}</h2>

          <section>
            <Slot />
          </section>

          <footer>
            <Slot name="footer">
              <button onClick={() => count.value++}>
                count: {count.value}
              </button>
            </Slot>
          </footer>

          <button
            onClick={() => {
              ctx.emit('select', {
                title: props.title,
                count: count.value,
              })
            }}
          >
            select
          </button>
        </article>
      </Host>
    )
  },
)
```

## index.html

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Zeus Web Component</title>
  </head>
  <body>
    <z-counter-card title="Zeus Card" active>
      <p>Light DOM content</p>
      <span slot="footer">custom footer</span>
    </z-counter-card>

    <script type="module" src="/src/main.tsx"></script>
    <script>
      document
        .querySelector('z-counter-card')
        .addEventListener('select', event => {
          console.log('select', event.detail)
        })
    </script>
  </body>
</html>
```

---

# A7：补 runtime cleanup 测试

runtime-dom 当前已经有：

```txt
bindEvent() cleanup
mountFor() cleanup
render/scope 体系
```

其中 `bindEvent()` 会在 scope dispose 时删除 `__zeusEvents` 里的 handler。

`mountFor()` 也会在 dispose 时 stop runner 并 remove nodes。

现在要补测试。

## 新增测试文件

```txt
packages/runtime-dom/__tests__/cleanup.spec.ts
```

代码草案：

```ts
import { describe, expect, it, vi } from 'vitest'

import { scope, state } from '@zeus-js/signal'
import { bindEvent, bindRef, delegateEvents, mountFor, render } from '../src'

describe('runtime cleanup', () => {
  it('stops render scope after dispose', () => {
    const count = state(0)
    const container = document.createElement('div')
    const text = document.createTextNode('')

    const dispose = render(() => {
      text.data = String(count.value)
      return text
    }, container)

    expect(container.textContent).toBe('0')

    dispose()

    count.value++

    expect(container.textContent).toBe('')
  })

  it('removes delegated event handler on scope stop', () => {
    const button = document.createElement('button')
    const fn = vi.fn()
    const s = scope()

    delegateEvents(['click'])

    s.run(() => {
      bindEvent(button, 'click', fn)
    })

    document.body.appendChild(button)

    button.click()
    expect(fn).toHaveBeenCalledTimes(1)

    s.stop()

    button.click()
    expect(fn).toHaveBeenCalledTimes(1)

    button.remove()
  })

  it('clears ref on scope stop', () => {
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

  it('removes For nodes on scope stop', () => {
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

## 另一个建议测试：Show 切换

```ts
import { mountShow } from '../src'

it('clears old Show nodes when condition changes', () => {
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
})
```

---

# Phase A 验收命令

跑：

```bash
pnpm build
pnpm build-dts
pnpm check
pnpm test-unit
pnpm -F @zeus-js/example-counter build
pnpm -F @zeus-js/example-todo build
pnpm -F @zeus-js/example-web-component build
```

如果 examples 包名不同，以实际 package name 为准。

根脚本里已经有：

```bash
pnpm examples:check
```

可以后续把 example 的 `check` 纳入这个命令。

---

# Phase A 完成标准

完成后，Zeus 可以正式标记为：

```txt
v0.1.0-alpha 技术 MVP
```

标准是：

```txt
1. counter 能运行，点击 +/- 正常更新
2. todo 能运行，For keyed 基本可用
3. web-component 能运行，Slot / props / emit 正常
4. compiler physical DOM path 有 snapshot
5. runtime cleanup 有单测
6. state(Map/Set) 类型与运行时一致
7. pnpm build / check / test-unit 通过
```

---

# 推荐提交顺序

```txt
1. fix(signal): align state Map/Set types with runtime behavior
2. refactor(compiler): rename dynamic text generated ref to anchor
3. test(compiler): add physical DOM path snapshots
4. test(runtime-dom): add cleanup tests
5. example: add todo example
6. example: add web-component example
7. docs: document MVP behavior and For keyed limitation
```

这组提交完成后，你就可以进入 Phase B：**API 收敛**。也就是把 `@zeus-js/zeus` 主入口从“内部 helper 全暴露”收敛成面向用户的最小 API。
