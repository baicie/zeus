结论：**最优修复不应该放在 headless 组件里做 local `state()` 同步，也不应该改编译器生成 `watch`。最优方案是在 `defineElement` runtime 层统一修复 props 数据源：把每个 prop 变成独立 `ValueState`，再把传给 `setup(props)` 的 `props.xxx` 设计成读取对应 `slot.value` 的 getter。**

这样 JSX 编译产物仍然保持：

```ts
_bindAttr(_el$, 'disabled', () => Boolean(props.disabled))
```

但 `props.disabled` 会进入 `ValueState.value` 的依赖追踪，外部 `el.disabled = true`、`setAttribute('disabled', '')`、内部 context 写入都更新同一份 prop slot，从根上修复 `bindAttr` getter 不重跑的问题。

---

## 1. 当前问题判断

你文档里记录的现象是：`defineElement` 内 JSX 动态属性已经正确编译成 `_bindAttr(..., () => props.xxx)`，但外部 property 更新后，内层元素属性不更新。issue 文档明确把影响范围定位为 `defineElement` 内层元素的动态 `aria-*` / boolean 属性，并列出 button、checkbox、switch、tabs、dialog、icon 等失败场景。([GitHub][1])

当前 `defineElement` 的 props 是这样建的：

```ts
private readonly props = state({}) as P
```

constructor 里先写默认值，再给 host 定义 property accessor。
`attributeChangedCallback` 和 `_writePropFromProperty` 都是直接写 `this.props[key]`。
编译器的 `emitAttrBinding` 会把普通动态属性生成 `bindAttr(el, name, () => expr)`，这一点是对的。
`bindAttr` 本身也只是开一个 effect 后调用 `setAttr(el, name, value())`，所以只要 `value()` 内部读到了正确响应式源，就应该能更新。

真正危险点有两个：

1. `props` 是一个整体 reactive object，依赖绑定靠 Proxy 的 `get/set` 间接连接，调试和边界处理都比较脆。
2. `definePropAccessors` 目前遇到 `def.key in element` 会直接跳过，这会导致 `hidden`、`tabIndex` 等原生 HTMLElement 属性名绕过 `_writePropFromProperty`。

所以只在组件里改 `state()` 是治标，不适合做框架级修复。

---

## 2. 推荐方案：runtime 级 PropStore

### 目标

把 `defineElement` 的 props 从：

```ts
props = reactiveObject
```

改成：

```ts
props = getter facade
propSlots = Map<propKey, ValueState>
```

也就是：

```ts
props.disabled
// 实际读取：
propSlots.get('disabled')!.value
```

外部写入：

```ts
el.disabled = true
```

内部进入：

```ts
_writePropFromProperty('disabled', true)
  -> propStore.set('disabled', true)
  -> disabledSlot.value = true
  -> bindAttr effect rerun
```

属性写入：

```ts
el.setAttribute('disabled', '')
```

内部进入：

```ts
attributeChangedCallback
  -> propStore.set('disabled', true)
  -> disabledSlot.value = true
```

### 为什么比文档里的 A/B/C 更优

| 方案                              | 评价                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| A：手动 trigger effect            | 不建议。会暴露或依赖 signal 内部 targetMap/dep，不利于后续替换响应式实现。            |
| B：编译器生成 watch               | 不建议。会把 runtime bug 扩散到 compiler，生成代码变重，且每个 prop 都要多 watch。    |
| C：组件全部 local state           | 可以作为临时止血，但会让每个组件都重复写 props → local state 同步逻辑，长期不可维护。 |
| **推荐：defineElement PropStore** | 最优。runtime 一处修复，编译器无需改，组件代码无需改，符合单一数据源。                |

---

## 3. 代码草案：`defineElement.ts`

核心改动集中在 `packages/core/runtime-dom/src/defineElement.ts`。

### 3.1 import 调整

```ts
import { state } from '@zeus-js/signal'

import type { ValueState } from '@zeus-js/signal'
```

`state()` 无参数时会返回 `ValueState<T | undefined>`，这正好适合做每个 prop 的独立 slot。

---

### 3.2 新增 PropStore

放在 `NormalizedPropDefinition` 后面即可。

```ts
interface PropStore<P extends object> {
  readonly props: Readonly<P>
  get(key: string): unknown
  set(key: string, value: unknown): void
  has(key: string): boolean
}

function createPropStore<P extends object>(
  defs: readonly NormalizedPropDefinition[],
): PropStore<P> {
  const slots = new Map<string, ValueState<unknown>>()
  const props: Record<string, unknown> = {}

  for (const def of defs) {
    const slot = state<unknown>() as ValueState<unknown>
    slots.set(def.key, slot)

    Object.defineProperty(props, def.key, {
      configurable: false,
      enumerable: true,
      get() {
        return slot.value
      },
      set(value: unknown) {
        slot.value = value
      },
    })
  }

  return {
    props: props as Readonly<P>,

    get(key: string): unknown {
      return slots.get(key)?.value
    },

    set(key: string, value: unknown): void {
      const slot = slots.get(key)

      if (!slot) {
        if (__DEV__) {
          console.warn(
            `[Zeus custom-element] Unknown prop "${key}" was written.`,
          )
        }
        return
      }

      slot.value = value
    },

    has(key: string): boolean {
      return slots.has(key)
    },
  }
}
```

这里不要再用 `state({})`。每个 prop 一个 slot，可以避免 “object proxy + dynamic key + raw target” 的隐式绑定问题。

---

### 3.3 替换 class 字段

原来：

```ts
private readonly props = state({}) as P
```

改成：

```ts
private readonly propStore = createPropStore<P>(propDefs)
private readonly props = this.propStore.props
```

constructor 改成：

```ts
constructor() {
  super()

  applyPropDefaults(this.propStore, propDefs)
  definePropAccessors(this, this.propStore, propDefs)
}
```

---

### 3.4 改造默认值写入

原来 `applyPropDefaults` 写 `Record<string, unknown>`，改成写 `PropStore`：

```ts
function applyPropDefaults<P extends object>(
  store: PropStore<P>,
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    if (!('default' in def)) continue

    const value =
      typeof def.default === 'function'
        ? (def.default as () => unknown)()
        : def.default

    store.set(def.key, value)
  }
}
```

---

### 3.5 改造 setup 入参

原来：

```ts
setup(this.props as Readonly<P>, setupContext)
```

改成：

```ts
setup(this.props, setupContext)
```

完整片段：

```ts
this.dispose = render(
  () =>
    runWithOwner(owner, () =>
      withHostContext(hostContext, () => setup(this.props, setupContext)),
    ),
  target,
  { owner },
)
```

---

### 3.6 改造 attr/property 写入链路

`attributeChangedCallback`：

```ts
attributeChangedCallback(
  name: string,
  oldValue: string | null,
  newValue: string | null,
): void {
  if (oldValue === newValue || this.reflecting) return

  const def = propDefs.find(item => item.attr === name)

  if (!def) return

  this.propStore.set(def.key, castAttributeValue(newValue, def))
}
```

`syncAttributesToProps`：

```ts
private syncAttributesToProps(
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    if (def.attr === false) continue

    const value = this.getAttribute(def.attr)

    if (value !== null || def.type === Boolean) {
      this.propStore.set(def.key, castAttributeValue(value, def))
    }
  }
}
```

`_writePropFromProperty`：

```ts
_writePropFromProperty(key: string, value: unknown): void {
  const def = propDefs.find(item => item.key === key)

  this.propStore.set(key, value)

  if (def?.reflect && def.attr !== false) {
    this.reflecting = true

    try {
      reflectPropToAttribute(this, def, value)
    } finally {
      this.reflecting = false
    }
  }
}
```

---

### 3.7 改造 definePropAccessors

关键点：**不要再因为 `def.key in element` 就跳过**。这个判断会让 `hidden`、`tabIndex` 这种 native key 绕过 Zeus props。

```ts
function definePropAccessors<P extends object>(
  element: HTMLElement,
  store: PropStore<P>,
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    const key = def.key
    const hadOwnValue = Object.prototype.hasOwnProperty.call(element, key)
    const ownValue = hadOwnValue
      ? (element as HTMLElement & Record<string, unknown>)[key]
      : undefined

    if (hadOwnValue) {
      // Handle pre-upgrade properties:
      // const el = document.createElement('z-button')
      // el.disabled = true
      // customElements.define(...)
      delete (element as HTMLElement & Record<string, unknown>)[key]
    }

    const existing = Object.getOwnPropertyDescriptor(element, key)

    if (existing && existing.configurable === false) {
      if (__DEV__) {
        console.warn(
          `[Zeus custom-element] Cannot define prop "${key}" because an own non-configurable property already exists.`,
        )
      }
      continue
    }

    Object.defineProperty(element, key, {
      configurable: true,
      enumerable: true,
      get() {
        return store.get(key)
      },
      set(value: unknown) {
        ;(
          element as HTMLElement & {
            _writePropFromProperty: (key: string, value: unknown) => void
          }
        )._writePropFromProperty(key, value)
      },
    })

    if (hadOwnValue) {
      ;(
        element as HTMLElement & {
          _writePropFromProperty: (key: string, value: unknown) => void
        }
      )._writePropFromProperty(key, ownValue)
    }
  }
}
```

这个版本同时解决：

```ts
el.disabled = true
el.hidden = true
el.tabIndex = 0
```

这类 property 写入绕过 props 的问题。

---

## 4. 回归测试草案

建议新增一个 runtime 级测试文件：

`packages/core/runtime-dom/__tests__/defineElement.props.spec.tsx`

### 4.1 测试工具

```tsx
import { JSDOM } from 'jsdom'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { defineElement } from '../src/defineElement'
import { Host } from '../src/host'

let id = 0

function tag(name: string) {
  id++
  return `z-${name}-${id}`
}

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}
```

---

### 4.2 property 写入应触发 bindAttr

```tsx
describe('defineElement props tracking', () => {
  let dom: JSDOM

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('reruns bindAttr getter when host property changes', async () => {
    interface Props {
      disabled?: boolean
    }

    const name = tag('prop-tracking')

    defineElement<Props>(
      name,
      {
        shadow: false,
        props: {
          disabled: {
            type: Boolean,
            default: false,
            reflect: true,
          },
        },
      },
      props => (
        <Host>
          <button
            disabled={Boolean(props.disabled)}
            aria-disabled={props.disabled ? 'true' : undefined}
          />
        </Host>
      ),
    )

    document.body.innerHTML = `<${name}></${name}>`

    const el = document.querySelector(name) as HTMLElement & {
      disabled?: boolean
    }

    await nextFrame()

    const button = el.querySelector('button')!

    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-disabled')).toBe(false)

    el.disabled = true
    await nextFrame()

    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(el.hasAttribute('disabled')).toBe(true)

    el.disabled = false
    await nextFrame()

    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-disabled')).toBe(false)
    expect(el.hasAttribute('disabled')).toBe(false)
  })
})
```

---

### 4.3 attribute 写入也应触发

```tsx
it('reruns bindAttr getter when reflected attribute changes', async () => {
  interface Props {
    disabled?: boolean
  }

  const name = tag('attr-tracking')

  defineElement<Props>(
    name,
    {
      shadow: false,
      props: {
        disabled: {
          type: Boolean,
          default: false,
          reflect: true,
        },
      },
    },
    props => (
      <Host>
        <button disabled={Boolean(props.disabled)} />
      </Host>
    ),
  )

  document.body.innerHTML = `<${name}></${name}>`

  const el = document.querySelector(name)!

  await nextFrame()

  const button = el.querySelector('button')!

  el.setAttribute('disabled', '')
  await nextFrame()

  expect(button.disabled).toBe(true)

  el.removeAttribute('disabled')
  await nextFrame()

  expect(button.disabled).toBe(false)
})
```

---

### 4.4 native key 不应绕过 props，例如 hidden

```tsx
it('does not skip native HTMLElement property names', async () => {
  interface Props {
    hidden?: boolean
  }

  const name = tag('native-hidden')

  defineElement<Props>(
    name,
    {
      shadow: false,
      props: {
        hidden: {
          type: Boolean,
          default: false,
        },
      },
    },
    props => (
      <Host>
        <section hidden={Boolean(props.hidden)} />
      </Host>
    ),
  )

  document.body.innerHTML = `<${name}></${name}>`

  const el = document.querySelector(name) as HTMLElement

  await nextFrame()

  const section = el.querySelector('section')!

  expect(section.hidden).toBe(false)

  el.hidden = true
  await nextFrame()

  expect(section.hidden).toBe(true)
})
```

这个测试能直接抓住当前 `if (def.key in element) continue` 的问题。

---

### 4.5 pre-upgrade property 支持

```tsx
it('preserves pre-upgrade property values', async () => {
  interface Props {
    disabled?: boolean
  }

  const name = tag('pre-upgrade')

  const el = document.createElement(name) as HTMLElement & {
    disabled?: boolean
  }

  el.disabled = true
  document.body.appendChild(el)

  defineElement<Props>(
    name,
    {
      shadow: false,
      props: {
        disabled: {
          type: Boolean,
          default: false,
          reflect: true,
        },
      },
    },
    props => (
      <Host>
        <button disabled={Boolean(props.disabled)} />
      </Host>
    ),
  )

  await customElements.whenDefined(name)
  await nextFrame()

  const button = el.querySelector('button')!

  expect(button.disabled).toBe(true)
  expect(el.hasAttribute('disabled')).toBe(true)
})
```

---

## 5. 对 headless 组件的处理建议

这次不要继续在 button、checkbox、switch、tabs、dialog、icon 里补一堆 local `state()`。

推荐顺序：

1. 先合入 `defineElement` PropStore 修复。
2. 保留你已经把 JSX 属性改成声明式绑定的方向。
3. 只在真正属于组件内部状态的地方使用 local `state()`，例如 checkbox 内部 uncontrolled checked。
4. 外部受控 props，比如 `disabled`、`checked`、`open`、`hidden`，继续直接读 `props.xxx`。
5. 所有 headless 测试保留，额外补 runtime 级回归测试，避免后续组件测试掩盖 framework bug。

---

## 6. 验证命令

优先跑最小集合：

```bash
pnpm test-unit -- packages/core/runtime-dom/__tests__/defineElement.props.spec.tsx
pnpm test-unit -- examples/headless/__tests__/button.spec.tsx
pnpm test-unit -- examples/headless/__tests__/checkbox.spec.tsx
pnpm test-unit -- examples/headless/__tests__/switch.spec.tsx
pnpm test-unit -- examples/headless/__tests__/tabs.spec.tsx
pnpm test-unit -- examples/headless/__tests__/dialog.spec.tsx
pnpm test-unit -- examples/headless/__tests__/icon.spec.tsx
```

最后跑完整检查：

```bash
pnpm build
pnpm check
pnpm test-unit
```

---

## 7. 最终建议

这次修复的核心 PR title 可以是：

```txt
fix(runtime-dom): make defineElement props trackable across property and attribute updates
```

commit 可以拆成两条：

```txt
fix(runtime-dom): back defineElement props with per-prop reactive slots
test(runtime-dom): cover defineElement prop tracking for bindAttr
```

这个方案会比单独采用文档里的方案 C 更适合框架主线：**组件层保持声明式，编译器不变，runtime 一处把 property、attribute、setup props、bindAttr 全部接到同一个响应式数据源。**

[1]: https://github.com/baicie/zeus/blob/fix/compiler/attrs/docs/internal/issue/reactive-bindAttr-tracking.md 'zeus/docs/internal/issue/reactive-bindAttr-tracking.md at fix/compiler/attrs · baicie/zeus · GitHub'
