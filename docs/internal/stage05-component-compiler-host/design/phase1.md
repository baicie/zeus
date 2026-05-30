# Phase 1：增强 Host 的详细设计与代码草案

Phase 1 的核心目标是：

```txt id="fbkcpm"
defineElement 继续负责 Web Component 定义、注册、生命周期
Host 负责控制当前 custom element 宿主元素的 attributes / class / style / ref
Slot 继续负责内容分发
```

也就是从现在的：

```tsx id="5zunqd"
<Host>
  <Slot />
</Host>
```

升级到：

```tsx id="dqt407"
<Host
  data-state={props.open ? 'open' : 'closed'}
  data-disabled={props.disabled ? '' : undefined}
  class={['z-button', props.disabled && 'is-disabled']}
  style={{ '--z-button-gap': 8 }}
>
  <Slot />
</Host>
```

最终同步到宿主元素：

```html id="fxt2tp"
<z-button
  data-state="closed"
  data-disabled
  class="z-button is-disabled"
  style="--z-button-gap: 8px;"
>
</z-button>
```

当前 `Host` 只是透明返回 children，`Slot` 已经基于 host context 区分 shadow/light DOM，`defineElement` 已经负责 custom element 的注册、props、生命周期和 CustomEvent。  

---

# 1. Phase 1 目标

## 做什么

```txt id="96vdq2"
1. 增强 HostProps 类型
2. Host 支持绑定当前 custom element 宿主元素
3. 支持 class / className
4. 支持 style
5. 支持 ref
6. 支持 data-* / aria-* / role / part / id / title / tabindex 等 host attributes
7. 支持动态响应式更新
8. 增加 Host 单测
9. 增加 defineElement + Host 示例
10. 增加 compiler snapshot，锁定 Host 编译输出
```

## 不做什么

```txt id="outwvm"
1. Host 不负责 customElements.define
2. Host 不负责 props 声明
3. Host 不负责 Web Component 注册
4. Host 不生成额外 DOM 节点
5. Host 暂不处理 onClick/onKeyDown 这类事件
6. Host 暂不做 meta 抽取
7. Host 暂不处理 React/Vue wrapper
```

事件绑定留到后续再看，因为 Web Component 的主要事件应该由内部元素触发后通过 `emit()` 转成 `CustomEvent`。当前 `defineElement` 的 `emit` 已经会 dispatch `CustomEvent`，并默认 `bubbles/composed/cancelable`。

---

# 2. 为什么 Phase 1 先做 Host

后续你要做 headless + shadcn-like，这种组件需要大量暴露状态：

```txt id="jxgz86"
data-state
data-disabled
data-open
data-checked
data-orientation
data-side
data-align
aria-expanded
aria-disabled
role
part
class
style
```

如果没有增强 Host，组件只能这样写：

```tsx id="pss4j3"
context.host.setAttribute('data-state', props.open ? 'open' : 'closed')
```

这会非常不优雅，也不利于编译器后续抽 meta。

增强后写法会自然很多：

```tsx id="kxeupt"
return (
  <Host
    data-state={props.open ? 'open' : 'closed'}
    aria-disabled={props.disabled}
  >
    <Slot />
  </Host>
)
```

---

# 3. 最终 API 设计

## 基础用法

```tsx id="p7rv8k"
export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    shadow: false,
    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
  },
  props => {
    return (
      <Host
        data-slot="button"
        data-variant={props.variant}
        data-disabled={props.disabled ? '' : undefined}
        class={[
          'z-button',
          props.disabled && 'z-button-disabled',
        ]}
      >
        <button disabled={props.disabled}>
          <Slot />
        </button>
      </Host>
    )
  },
)
```

## Host outside custom element

如果不在 `defineElement` 内部使用：

```tsx id="qjlmvz"
<Host>
  <span>hello</span>
</Host>
```

仍然保持透明 wrapper，不报错、不生成额外节点。

## 多个 Host

Phase 1 允许多个 Host，但约定：

```txt id="kyf4zs"
一个 defineElement setup 里推荐只使用一个主 Host
多个 Host 同时写同一个 attribute，后绑定者覆盖前绑定者
```

后续 analyzer 可以加 dev warning。

---

# 4. 文件变更

建议修改：

```txt id="4tx1zf"
packages/runtime-dom/src/webComponents.ts
```

新增测试：

```txt id="ea829b"
packages/runtime-dom/__tests__/host.spec.tsx
```

可选增加：

```txt id="nr5pnk"
packages/compiler/__tests__/hostTransform.spec.ts
examples/web-component/src/components/host-button.tsx
docs/internal/design/component-compiler-host-phase1.md
```

当前 runtime-dom 已经导出了 `Host` 和 `HostProps`，所以只要改 `webComponents.ts`，公共出口不用变。

---

# 5. Host 实现设计

当前 `bindings.ts` 已有：

```txt id="er66jp"
setAttr
bindAttr
bindClass
bindStyle
bindProp
```

这些都已经通过 `effect()` 做响应式绑定，可以直接复用。 

`refs.ts` 也已经有 `bindRef()`，并且会在 scope dispose 时把 ref 清空。

---

# 6. 代码草案：增强 `webComponents.ts`

```ts id="f6epnt"
// packages/runtime-dom/src/webComponents.ts

import {
  bindAttr,
  bindClass,
  bindStyle,
} from './bindings'
import { getCurrentHostContext } from './hostContext'
import { bindRef } from './refs'
import { createSlot } from './slot'

import type {
  AttrValue,
  ClassValue,
  JSXValue,
  RefTarget,
  StyleValue,
} from './types'

type HostValue<T> = T | (() => T)

export interface HostProps extends Record<string, unknown> {
  children?: JSXValue | (() => JSXValue)

  /**
   * Ref to current custom element host.
   */
  ref?: RefTarget<HTMLElement>

  /**
   * class and className both map to host class attribute.
   */
  class?: HostValue<ClassValue>
  className?: HostValue<ClassValue>

  /**
   * Inline style for host element.
   */
  style?: HostValue<StyleValue>

  /**
   * Common host attributes.
   */
  id?: HostValue<AttrValue>
  role?: HostValue<AttrValue>
  part?: HostValue<AttrValue>
  title?: HostValue<AttrValue>
  slot?: HostValue<AttrValue>
  tabIndex?: HostValue<number | null | undefined | false>

  /**
   * data-* / aria-* are accepted through index signature.
   */
}

export interface SlotProps {
  name?: string
  children?: JSXValue | (() => JSXValue)
}

const HOST_RESERVED_KEYS = new Set([
  'children',
  'ref',
  'class',
  'className',
  'style',
])

export function Host(props: HostProps): JSXValue {
  const context = getCurrentHostContext()

  if (context) {
    bindHostProps(context.host, props)
  }

  return resolveValue(props.children)
}

export function Slot(props: SlotProps): JSXValue {
  return createSlot(props.name, () => resolveValue(props.children))
}

function bindHostProps(host: HTMLElement, props: HostProps): void {
  bindHostRef(host, props)
  bindHostClass(host, props)
  bindHostStyle(host, props)
  bindHostAttributes(host, props)
}

function bindHostRef(host: HTMLElement, props: HostProps): void {
  if (!('ref' in props)) return

  bindRef(host, props.ref)
}

function bindHostClass(host: HTMLElement, props: HostProps): void {
  if (!('class' in props) && !('className' in props)) return

  /**
   * className has higher priority than class when both exist.
   */
  const value =
    props.className !== undefined ? props.className : props.class

  bindClass(host, () => {
    return resolveHostValue(value) as ClassValue
  })
}

function bindHostStyle(host: HTMLElement, props: HostProps): void {
  if (!('style' in props)) return

  bindStyle(host, () => {
    return resolveHostValue(props.style) as StyleValue
  })
}

function bindHostAttributes(host: HTMLElement, props: HostProps): void {
  for (const key of Object.keys(props)) {
    if (HOST_RESERVED_KEYS.has(key)) continue
    if (isEventLikeProp(key)) continue

    const value = props[key]
    const attrName = normalizeHostAttrName(key)

    bindAttr(host, attrName, () => {
      return resolveHostValue(value) as AttrValue
    })
  }
}

function resolveHostValue(value: unknown): unknown {
  /**
   * JSX component props may be direct values or lazy getters.
   * Function values are treated as getters except event-like props,
   * which are filtered before this function is called.
   */
  return typeof value === 'function'
    ? (value as () => unknown)()
    : value
}

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : value
}

function isEventLikeProp(key: string): boolean {
  /**
   * Host Phase 1 does not bind event listeners.
   * Keep event handling inside component template + emit().
   */
  return /^on[A-Z]/.test(key) || key.startsWith('on:')
}

function normalizeHostAttrName(name: string): string {
  switch (name) {
    case 'className':
      return 'class'
    case 'htmlFor':
      return 'for'
    case 'tabIndex':
      return 'tabindex'
    case 'readOnly':
      return 'readonly'
    default:
      return name
  }
}
```

---

# 7. 这个实现的语义

## 7.1 Host 不生成 DOM

```tsx id="zlao5c"
<Host>
  <button />
</Host>
```

最终仍然只有：

```html id="3cjz9e"
<button></button>
```

`Host` 只是把 props 绑定到当前 custom element 的宿主元素。

## 7.2 Host 只能在 defineElement 中控制宿主元素

因为 `defineElement` 在渲染时会创建 hostContext：

```ts id="mwabir"
const hostContext: HostRenderContext = {
  host: this,
  mode,
  lightChildren: this.lightChildren,
}
```

然后通过 `withHostContext` 包裹 setup 渲染。

所以 Host 可以通过：

```ts id="4e5ej9"
getCurrentHostContext()
```

拿到当前 custom element host。

## 7.3 动态更新依赖 effect

`bindAttr / bindClass / bindStyle` 内部已经使用 `effect()`。 

所以：

```tsx id="kfwpw7"
<Host data-state={props.open ? 'open' : 'closed'} />
```

当 `props.open` 变化时，host attribute 应该跟着更新。

---

# 8. Host 测试设计

## 需要覆盖

```txt id="xjz3uw"
1. Host outside custom element 仍然透明
2. Host inside defineElement 可以设置 data-* attribute
3. 动态 data-state 随 property 更新
4. false/null/undefined 会移除 attribute
5. true 会设置空 attribute
6. class / className 绑定
7. style 绑定
8. ref 绑定到 host
9. event-like props 被忽略
10. Host 不生成额外 DOM
```

---

# 9. 代码草案：`host.spec.tsx`

```tsx id="b6rz20"
// packages/runtime-dom/__tests__/host.spec.tsx

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../src/render'
import { defineElement } from '../src/defineElement'
import { Host, Slot } from '../src/webComponents'

let uid = 0

function createTag(name: string): string {
  uid += 1
  return `z-host-${name}-${uid}`
}

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('Host', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders children as transparent wrapper outside custom element', () => {
    const container = document.createElement('div')

    render(
      () => (
        <Host>
          <span>host child</span>
        </Host>
      ),
      container,
    )

    expect(container.innerHTML).toBe('<span>host child</span>')
  })

  it('binds data attributes to current custom element host', async () => {
    const tag = createTag('data-attrs')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <Host data-state="open" data-slot="button">
            <button>button</button>
          </Host>
        )
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('data-state')).toBe('open')
    expect(el.getAttribute('data-slot')).toBe('button')
    expect(el.innerHTML).toContain('<button>button</button>')
  })

  it('updates host data-state when prop changes', async () => {
    const tag = createTag('dynamic-state')

    defineElement<{ open?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          open: {
            type: Boolean,
            default: false,
            reflect: true,
          },
        },
      },
      props => {
        return (
          <Host data-state={props.open ? 'open' : 'closed'}>
            <Slot />
          </Host>
        )
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      open?: boolean
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('data-state')).toBe('closed')

    el.open = true

    await nextFrame()

    expect(el.getAttribute('data-state')).toBe('open')
  })

  it('removes host attribute when value is false/null/undefined', async () => {
    const tag = createTag('remove-attrs')

    defineElement<{ disabled?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          disabled: {
            type: Boolean,
            default: true,
          },
        },
      },
      props => {
        return (
          <Host
            data-disabled={props.disabled ? '' : undefined}
            aria-disabled={props.disabled ? 'true' : undefined}
          >
            <button>button</button>
          </Host>
        )
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      disabled?: boolean
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.hasAttribute('data-disabled')).toBe(true)
    expect(el.getAttribute('aria-disabled')).toBe('true')

    el.disabled = false

    await nextFrame()

    expect(el.hasAttribute('data-disabled')).toBe(false)
    expect(el.hasAttribute('aria-disabled')).toBe(false)
  })

  it('sets empty attribute when value is true', async () => {
    const tag = createTag('true-attr')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <Host hidden={true}>
            <span>hidden</span>
          </Host>
        )
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.hasAttribute('hidden')).toBe(true)
    expect(el.getAttribute('hidden')).toBe('')
  })

  it('binds class and className to host class attribute', async () => {
    const tag = createTag('class')

    defineElement<{ active?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          active: {
            type: Boolean,
            default: false,
          },
        },
      },
      props => {
        return (
          <Host
            class={[
              'z-button',
              {
                'is-active': props.active,
              },
            ]}
          >
            <button>button</button>
          </Host>
        )
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      active?: boolean
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('class')).toBe('z-button')

    el.active = true

    await nextFrame()

    expect(el.getAttribute('class')).toBe('z-button is-active')
  })

  it('prefers className over class when both exist', async () => {
    const tag = createTag('class-name')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <Host class="from-class" className="from-class-name">
            <span>content</span>
          </Host>
        )
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('class')).toBe('from-class-name')
  })

  it('binds style to host element', async () => {
    const tag = createTag('style')

    defineElement<{ gap?: number }>(
      tag,
      {
        shadow: false,
        props: {
          gap: {
            type: Number,
            default: 4,
          },
        },
      },
      props => {
        return (
          <Host
            style={{
              display: 'inline-flex',
              gap: props.gap,
              opacity: 1,
            }}
          >
            <span>styled</span>
          </Host>
        )
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      gap?: number
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.style.display).toBe('inline-flex')
    expect(el.style.gap).toBe('4px')
    expect(el.style.opacity).toBe('1')

    el.gap = 8

    await nextFrame()

    expect(el.style.gap).toBe('8px')
  })

  it('binds ref to host element', async () => {
    const tag = createTag('ref')
    const ref = vi.fn()

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <Host ref={ref}>
            <span>content</span>
          </Host>
        )
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(ref).toHaveBeenCalledWith(el)
  })

  it('ignores event-like props in phase 1', async () => {
    const tag = createTag('event-like')
    const onClick = vi.fn()

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <Host onClick={onClick}>
            <button>button</button>
          </Host>
        )
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.hasAttribute('onClick')).toBe(false)
    expect(el.hasAttribute('on-click')).toBe(false)
  })

  it('does not create extra DOM node', async () => {
    const tag = createTag('no-extra-node')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <Host data-state="ready">
            <span>one</span>
            <span>two</span>
          </Host>
        )
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.children.length).toBe(2)
    expect(el.children[0].tagName.toLowerCase()).toBe('span')
    expect(el.children[1].tagName.toLowerCase()).toBe('span')
  })
})
```

---

# 10. Compiler snapshot 测试

Phase 1 需要确认 `<Host data-state={...}>` 这种 JSX 能被当前 compiler 正常处理。

当前 compiler 的 JSX 主流程是 `lowerJSX -> normalizeChildren -> assignDomPaths -> assignPhysicalDomPaths -> analyzeBindings -> collectTemplates -> emitDOM`，所以 Host 相关 JSX 需要 snapshot 锁住。

---

## `hostTransform.spec.ts`

```ts id="ojvauf"
// packages/compiler/__tests__/hostTransform.spec.ts

import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'
import zeusCompiler from '../src'

function transform(code: string): string {
  const result = transformSync(code, {
    filename: 'host.fixture.tsx',
    sourceType: 'module',
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
      jsescOption: {
        minimal: true,
      },
    },
  })

  if (!result?.code) {
    throw new Error('Transform failed')
  }

  return result.code
}

describe('Host transform', () => {
  it('transforms Host with host attributes', () => {
    const code = transform(`
      import { defineElement, Host, Slot } from '@zeus-js/zeus'

      export const ZButton = defineElement(
        'z-button',
        { shadow: false },
        props => {
          return (
            <Host
              data-state={props.open ? 'open' : 'closed'}
              data-slot="button"
              class={['z-button', props.open && 'is-open']}
            >
              <button>
                <Slot />
              </button>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchInlineSnapshot()
  })

  it('transforms Host style object', () => {
    const code = transform(`
      import { defineElement, Host } from '@zeus-js/zeus'

      export const ZBox = defineElement(
        'z-box',
        { shadow: false },
        props => {
          return (
            <Host
              style={{
                display: 'block',
                opacity: props.active ? 1 : 0.5,
              }}
            >
              <span>box</span>
            </Host>
          )
        },
      )
    `)

    expect(code).toMatchInlineSnapshot()
  })
})
```

---

# 11. 示例组件：`examples/web-component/src/components/host-button.tsx`

```tsx id="56wzbw"
// examples/web-component/src/components/host-button.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface HostButtonProps {
  variant?: 'default' | 'outline'
  size?: 'sm' | 'md'
  disabled?: boolean
}

export const ZHostButton = defineElement<HostButtonProps>(
  'z-host-button',
  {
    shadow: false,
    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
      size: {
        type: String,
        default: 'md',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
  },
  (props, { emit }) => {
    return (
      <Host
        data-slot="button"
        data-variant={props.variant}
        data-size={props.size}
        data-disabled={props.disabled ? '' : undefined}
        class={[
          'z-host-button',
          `z-host-button-${props.variant}`,
          `z-host-button-${props.size}`,
          props.disabled && 'is-disabled',
        ]}
      >
        <button
          type="button"
          disabled={props.disabled}
          onClick={event => {
            if (props.disabled) return

            emit('press', {
              nativeEvent: event,
            })
          }}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
```

在 `examples/web-component/src/main.tsx` 中引入：

```ts id="mliem2"
import './components/host-button'
```

`index.html` 添加：

```html id="nswfaq"
<z-host-button variant="outline" size="md">
  Host Button
</z-host-button>
```

---

# 12. Phase 1 文档草案

新增：

```txt id="2l4gm0"
docs/internal/design/component-compiler-host-phase1.md
```

内容：

````md id="37vwjb"
# Component Compiler Host Phase 1

## Goal

Enhance `Host` as the host-element control primitive for Zeus Web Components.

## Runtime boundary

- `defineElement` defines and registers custom elements.
- `Host` binds attributes, class, style and ref to the current custom element host.
- `Slot` handles content distribution.

## Host does not

- define custom elements
- create extra DOM nodes
- declare props
- bind event listeners in Phase 1
- generate metadata directly

## Supported Host props

- class
- className
- style
- ref
- id
- role
- part
- title
- slot
- tabIndex
- data-*
- aria-*

## Example

```tsx
return (
  <Host
    data-state={props.open ? 'open' : 'closed'}
    aria-disabled={props.disabled}
    class={['z-button', props.disabled && 'is-disabled']}
  >
    <Slot />
  </Host>
)
````

## Future

Phase 2 component analyzer can scan Host usage to extract:

* hostAttributes
* data-state
* cssParts
* static style hooks

````

---

# 13. Phase 1 验收标准

```txt id="re5vw1"
[x] Host inside defineElement can bind data-* to custom element host
[x] Host supports dynamic data-state update
[x] Host supports class / className
[x] Host supports style
[x] Host supports ref
[x] Host remains transparent outside defineElement
[x] Host creates no extra DOM node
[x] Host ignores event-like props for now
[x] compiler Host snapshots are added
[x] examples/web-component includes z-host-button
[x] pnpm test-unit passes
[x] pnpm examples:check passes
[x] pnpm build passes
[x] pnpm build-dts passes
````

---

# 14. 推荐提交顺序

```bash id="qwp5q1"
git checkout feat/component-compiler-host

# 1. Host runtime enhancement
git add packages/runtime-dom/src/webComponents.ts
git commit -m "feat(runtime-dom): bind Host props to custom element host"

# 2. Host tests
git add packages/runtime-dom/__tests__/host.spec.tsx
git commit -m "test(runtime-dom): cover Host host-attribute bindings"

# 3. Compiler snapshots
git add packages/compiler/__tests__/hostTransform.spec.ts
git commit -m "test(compiler): cover Host attribute transform"

# 4. Example
git add examples/web-component
git commit -m "example: add Host-powered web component"

# 5. Docs
git add docs/internal/design/component-compiler-host-phase1.md
git commit -m "docs: add component compiler host phase1 design"
```

---

# 15. Phase 1 完成后的价值

完成后，Zeus 的 Web Component 写法会从：

```tsx id="c15987"
return (
  <button>
    <Slot />
  </button>
)
```

升级为 headless-friendly 写法：

```tsx id="daidtp"
return (
  <Host
    data-state={props.open ? 'open' : 'closed'}
    data-disabled={props.disabled ? '' : undefined}
    class={['z-button', props.disabled && 'is-disabled']}
  >
    <button>
      <Slot />
    </button>
  </Host>
)
```

这会直接支撑后续：

```txt id="6rqj0v"
Phase 2：Component Analyzer 扫描 Host 提取 hostAttributes / cssParts / slots
Phase 3：Bundler Plugin Host 输出 wc/react/vue
Phase 7：Headless Components
Phase 10：shadcn-like Registry
```

Phase 1 的关键不是大改架构，而是把 `Host` 从“透明 children helper”升级成 **headless 组件的宿主状态控制原语**。
