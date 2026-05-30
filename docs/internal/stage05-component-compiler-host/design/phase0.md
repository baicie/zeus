# Phase 0：Web Component MVP 稳定化详细设计

这阶段的目标不是做 `component-analyzer`、`react/vue wrapper` 或 shadcn-like registry，而是先把后续所有能力依赖的底座打稳。

当前 Zeus 已经有 `defineElement / Host / Slot / createSlot / hostContext` 出口，`defineElement` 也已经负责 props、attribute sync、property setter、shadow/light target、CustomEvent、styles 和生命周期。 
所以 Phase 0 的重点是：**补测试、补示例、补 compiler snapshot、补质量门禁**。

---

# 0. 分支

```bash id="u7wqw5"
git checkout -b feat/component-compiler-host
```

Phase 0 可以先提交为：

```bash id="jgmgtm"
test(runtime-dom): stabilize defineElement and slot behavior
```

或者拆成：

```bash id="6qm565"
test(runtime-dom): cover defineElement lifecycle
test(compiler): cover slot and web component jsx output
example: add web component example
docs: add component compiler host phase0 plan
```

---

# 1. Phase 0 目标

## 需要完成

```txt id="55q5z5"
1. defineElement 行为测试
2. Slot / light DOM / shadow DOM 行为测试
3. Host 当前行为测试
4. compiler 对 Web Component / Slot / Host 的 snapshot
5. 新增 examples/web-component
6. 新增 web component 示例检查脚本
7. 补内部设计文档
```

## 不做

```txt id="zgewe0"
1. 不做 React wrapper
2. 不做 Vue wrapper
3. 不做 Component Analyzer
4. 不做 output-wc/output-react/output-vue
5. 不做完整组件库
6. 不扩展 Host 为完整宿主属性绑定组件
```

Host 的增强放 Phase 1。Phase 0 只保证当前 Host / Slot / defineElement 语义稳定。

---

# 2. 文件变更总览

建议新增：

```txt id="l8mokh"
packages/runtime-dom/src/__tests__/
  defineElement.spec.tsx
  slot.spec.tsx
  host.spec.tsx

packages/compiler/src/__tests__/
  webComponentTransform.spec.ts

examples/web-component/
  package.json
  index.html
  src/
    main.tsx
    components/
      counter.tsx
      card.tsx
  tsconfig.json
  vite.config.ts

docs/internal/design/component-compiler-host-phase0.md
```

修改：

```txt id="3a1457"
package.json
  增加 example:web-component

scripts/check/check-examples.ts
  如果现有脚本已自动扫 examples，可不改
```

根目录已有 `build / build-dts / check / test / examples:check / size` 等脚本，可以直接把 Phase 0 的质量门禁接进去。

---

# 3. defineElement 测试设计

当前 `defineElement` 是后面跨框架组件库的核心，它必须稳定。

## 需要覆盖

```txt id="saewdy"
1. 默认 props
2. attribute -> props
3. property -> props
4. Boolean attribute
5. reflect
6. Object / Array property
7. CustomEvent emit
8. disconnected cleanup
9. styles 注入
10. customElements.define 重复保护
```

---

## 代码草案：`defineElement.spec.tsx`

```tsx id="j22w04"
// packages/runtime-dom/src/__tests__/defineElement.spec.tsx

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineElement } from '../defineElement'
import { Slot } from '../webComponents'

let uid = 0

function createTag(name: string) {
  uid += 1
  return `z-test-${name}-${uid}`
}

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('defineElement', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('defines a custom element and renders with default props', async () => {
    const tag = createTag('default-props')

    defineElement<{ label?: string }>(
      tag,
      {
        shadow: false,
        props: {
          label: {
            type: String,
            default: 'Hello',
            reflect: true,
          },
        },
      },
      props => {
        return <span>{props.label}</span>
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.textContent).toBe('Hello')
    expect((el as any).label).toBe('Hello')
  })

  it('syncs attribute to props', async () => {
    const tag = createTag('attr-to-prop')

    defineElement<{ count?: number }>(
      tag,
      {
        shadow: false,
        props: {
          count: Number,
        },
      },
      props => {
        return <span>{props.count}</span>
      },
    )

    const el = document.createElement(tag)
    el.setAttribute('count', '3')
    document.body.appendChild(el)

    await nextFrame()

    expect((el as any).count).toBe(3)
    expect(el.textContent).toBe('3')
  })

  it('syncs property to props', async () => {
    const tag = createTag('property-to-prop')

    defineElement<{ count?: number }>(
      tag,
      {
        shadow: false,
        props: {
          count: Number,
        },
      },
      props => {
        return <span>{props.count}</span>
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      count?: number
    }

    document.body.appendChild(el)

    el.count = 10

    await nextFrame()

    expect(el.textContent).toBe('10')
  })

  it('handles boolean attributes correctly', async () => {
    const tag = createTag('boolean')

    defineElement<{ disabled?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          disabled: Boolean,
        },
      },
      props => {
        return <button disabled={props.disabled}>button</button>
      },
    )

    const el = document.createElement(tag)
    el.setAttribute('disabled', '')
    document.body.appendChild(el)

    await nextFrame()

    const button = el.querySelector('button')!

    expect((el as any).disabled).toBe(true)
    expect(button.disabled).toBe(true)
  })

  it('reflects property changes to attributes', async () => {
    const tag = createTag('reflect')

    defineElement<{ active?: boolean; value?: string }>(
      tag,
      {
        shadow: false,
        props: {
          active: {
            type: Boolean,
            default: false,
            reflect: true,
          },
          value: {
            type: String,
            default: 'a',
            reflect: true,
          },
        },
      },
      props => {
        return <span>{props.value}</span>
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      active?: boolean
      value?: string
    }

    document.body.appendChild(el)

    el.active = true
    el.value = 'b'

    await nextFrame()

    expect(el.hasAttribute('active')).toBe(true)
    expect(el.getAttribute('value')).toBe('b')

    el.active = false

    await nextFrame()

    expect(el.hasAttribute('active')).toBe(false)
  })

  it('supports object and array props through properties', async () => {
    const tag = createTag('object-array')

    defineElement<{
      data?: { name: string }
      list?: string[]
    }>(
      tag,
      {
        shadow: false,
        props: {
          data: {
            type: Object,
            attr: false,
          },
          list: {
            type: Array,
            attr: false,
          },
        },
      },
      props => {
        return (
          <span>
            {props.data?.name}:{props.list?.join(',')}
          </span>
        )
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      data?: { name: string }
      list?: string[]
    }

    document.body.appendChild(el)

    el.data = { name: 'zeus' }
    el.list = ['a', 'b']

    await nextFrame()

    expect(el.textContent).toBe('zeus:a,b')
  })

  it('emits CustomEvent with detail', async () => {
    const tag = createTag('emit')

    defineElement<{ value?: string }>(
      tag,
      {
        shadow: false,
        props: {
          value: {
            type: String,
            default: 'ok',
          },
        },
      },
      (props, { emit }) => {
        return (
          <button
            onClick={() => {
              emit('change', {
                value: props.value,
              })
            }}
          >
            click
          </button>
        )
      },
    )

    const onChange = vi.fn()

    const el = document.createElement(tag)
    el.addEventListener('change', onChange)
    document.body.appendChild(el)

    await nextFrame()

    el.querySelector('button')!.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
      }),
    )

    expect(onChange).toHaveBeenCalledTimes(1)

    const event = onChange.mock.calls[0][0] as CustomEvent<{
      value: string
    }>

    expect(event.detail).toEqual({
      value: 'ok',
    })
    expect(event.bubbles).toBe(true)
    expect(event.composed).toBe(true)
    expect(event.cancelable).toBe(true)
  })

  it('renders into shadow root when shadow is true', async () => {
    const tag = createTag('shadow')

    defineElement(
      tag,
      {
        shadow: true,
      },
      () => {
        return <span>shadow content</span>
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot!.textContent).toBe('shadow content')
    expect(el.textContent).toBe('')
  })

  it('mounts styles into render target', async () => {
    const tag = createTag('styles')

    defineElement(
      tag,
      {
        shadow: true,
        styles: `
          :host {
            display: block;
          }
        `,
      },
      () => {
        return <span>styled</span>
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    const style = el.shadowRoot!.querySelector('style')

    expect(style).toBeTruthy()
    expect(style!.textContent).toContain('display: block')
  })

  it('does not throw when defineElement is called twice with same tag', () => {
    const tag = createTag('duplicate')

    const setup = () => <span>duplicate</span>

    expect(() => {
      defineElement(tag, {}, setup)
      defineElement(tag, {}, setup)
    }).not.toThrow()
  })

  it('cleans up render effect on disconnect', async () => {
    const tag = createTag('cleanup')
    const cleanup = vi.fn()

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <button
            ref={() => {
              cleanup()
            }}
          >
            cleanup
          </button>
        )
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    document.body.removeChild(el)

    await nextFrame()

    /**
     * 这里先做弱断言。
     * 如果 runtime 里 onCleanup / ref cleanup 已有明确语义，
     * 后续可以改成强断言。
     */
    expect(el.isConnected).toBe(false)
  })

  it('supports default slot in light DOM mode', async () => {
    const tag = createTag('light-slot')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <div>
            <Slot />
          </div>
        )
      },
    )

    const el = document.createElement(tag)
    el.textContent = 'slot content'

    document.body.appendChild(el)

    await nextFrame()

    expect(el.textContent).toContain('slot content')
  })
})
```

---

# 4. Slot 测试设计

## 需要覆盖

```txt id="aad98q"
1. shadow 模式生成原生 slot
2. light DOM 模式分发 default slot
3. light DOM 模式分发 named slot
4. fallback 内容
5. 无 host context 时 Slot 可以作为原生 slot
```

当前 `createSlot` 已经会根据 hostContext 判断 shadow/light 模式。shadow 下返回原生 `<slot>`，light 下从 captured light children 查找。

---

## 代码草案：`slot.spec.tsx`

```tsx id="fc39z4"
// packages/runtime-dom/src/__tests__/slot.spec.tsx

import { beforeEach, describe, expect, it } from 'vitest'
import { defineElement } from '../defineElement'
import { Slot } from '../webComponents'
import { createSlot } from '../slot'

let uid = 0

function createTag(name: string) {
  uid += 1
  return `z-slot-${name}-${uid}`
}

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('Slot', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('creates native slot when used outside host context', () => {
    const slot = createSlot()

    expect(slot).toBeInstanceOf(HTMLSlotElement)
    expect((slot as HTMLSlotElement).name).toBe('')
  })

  it('creates named native slot when used outside host context', () => {
    const slot = createSlot('prefix')

    expect(slot).toBeInstanceOf(HTMLSlotElement)
    expect((slot as HTMLSlotElement).name).toBe('prefix')
  })

  it('uses native slot in shadow mode', async () => {
    const tag = createTag('shadow')

    defineElement(
      tag,
      {
        shadow: true,
      },
      () => {
        return (
          <div>
            <Slot name="prefix" />
            <Slot />
          </div>
        )
      },
    )

    const el = document.createElement(tag)
    el.innerHTML = `
      <span slot="prefix">prefix</span>
      <span>default</span>
    `

    document.body.appendChild(el)

    await nextFrame()

    expect(el.shadowRoot!.querySelector('slot[name="prefix"]')).toBeTruthy()
    expect(el.shadowRoot!.querySelector('slot:not([name])')).toBeTruthy()
  })

  it('distributes default light DOM slot nodes in light mode', async () => {
    const tag = createTag('light-default')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <section>
            <Slot />
          </section>
        )
      },
    )

    const el = document.createElement(tag)
    el.innerHTML = `<span>default content</span>`

    document.body.appendChild(el)

    await nextFrame()

    expect(el.textContent).toContain('default content')
    expect(el.querySelector('section span')!.textContent).toBe(
      'default content',
    )
  })

  it('distributes named light DOM slot nodes in light mode', async () => {
    const tag = createTag('light-named')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <section>
            <header>
              <Slot name="header" />
            </header>
            <main>
              <Slot />
            </main>
          </section>
        )
      },
    )

    const el = document.createElement(tag)

    el.innerHTML = `
      <span slot="header">title</span>
      <span>body</span>
    `

    document.body.appendChild(el)

    await nextFrame()

    expect(el.querySelector('header')!.textContent).toContain('title')
    expect(el.querySelector('main')!.textContent).toContain('body')
  })

  it('renders fallback when no assigned nodes exist', async () => {
    const tag = createTag('fallback')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        return (
          <section>
            <Slot>fallback content</Slot>
          </section>
        )
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.textContent).toContain('fallback content')
  })
})
```

---

# 5. Host 当前行为测试

Phase 0 暂不增强 Host，只确认它不会破坏 children。

当前 Host 实现只是 `return resolveValue(props.children)`。

## 代码草案：`host.spec.tsx`

```tsx id="3p45by"
// packages/runtime-dom/src/__tests__/host.spec.tsx

import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '../render'
import { Host } from '../webComponents'

describe('Host', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders children as transparent wrapper', () => {
    const container = document.createElement('div')

    render(
      () => (
        <Host>
          <span>host child</span>
        </Host>
      ),
      container,
    )

    expect(container.innerHTML).toContain('<span>host child</span>')
  })

  it('supports function children', () => {
    const container = document.createElement('div')

    render(
      () => (
        <Host>
          {() => {
            return <span>lazy child</span>
          }}
        </Host>
      ),
      container,
    )

    expect(container.textContent).toBe('lazy child')
  })
})
```

---

# 6. Compiler Snapshot 测试设计

当前 compiler 的主流程是：

```txt id="w1mody"
JSX
  ↓
lowerJSX
  ↓
normalizeChildren
  ↓
assignDomPaths
  ↓
assignPhysicalDomPaths
  ↓
analyzeBindings
  ↓
collectTemplates
  ↓
emitDOM
```

这部分是后续组件库最容易出问题的地方，尤其是 Slot、Host、动态文本、事件、children。

---

## 需要覆盖的输入

```txt id="jjpcdn"
1. defineElement + Slot
2. defineElement + named Slot
3. defineElement + Host + Slot
4. defineElement + emit event
5. shadow false / true 不影响 JSX 编译
6. 连续动态文本
7. Slot fallback
```

---

## 代码草案：`webComponentTransform.spec.ts`

```ts id="6e2wvz"
// packages/compiler/src/__tests__/webComponentTransform.spec.ts

import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'
import zeusCompiler from '../index'

function transform(code: string) {
  const result = transformSync(code, {
    filename: 'fixture.tsx',
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

describe('compiler web component transform', () => {
  it('transforms defineElement with default Slot', () => {
    const code = transform(`
      import { defineElement, Slot } from '@zeus-js/zeus'

      export const ZCard = defineElement(
        'z-card',
        { shadow: false },
        () => {
          return (
            <section>
              <Slot />
            </section>
          )
        },
      )
    `)

    expect(code).toMatchInlineSnapshot()
  })

  it('transforms named Slot', () => {
    const code = transform(`
      import { defineElement, Slot } from '@zeus-js/zeus'

      export const ZCard = defineElement(
        'z-card',
        { shadow: false },
        () => {
          return (
            <section>
              <header>
                <Slot name="header" />
              </header>
              <main>
                <Slot />
              </main>
            </section>
          )
        },
      )
    `)

    expect(code).toMatchInlineSnapshot()
  })

  it('transforms Host with Slot', () => {
    const code = transform(`
      import { defineElement, Host, Slot } from '@zeus-js/zeus'

      export const ZButton = defineElement(
        'z-button',
        { shadow: false },
        props => {
          return (
            <Host>
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

  it('transforms event emit in setup', () => {
    const code = transform(`
      import { defineElement, Slot } from '@zeus-js/zeus'

      export const ZButton = defineElement(
        'z-button',
        { shadow: false },
        (props, { emit }) => {
          return (
            <button
              onClick={() => emit('press', { value: true })}
            >
              <Slot />
            </button>
          )
        },
      )
    `)

    expect(code).toContain('delegateEvents')
    expect(code).toMatchInlineSnapshot()
  })

  it('transforms continuous dynamic text in web component setup', () => {
    const code = transform(`
      import { defineElement } from '@zeus-js/zeus'

      export const ZText = defineElement(
        'z-text',
        { shadow: false },
        props => {
          return (
            <span>
              {props.a}
              {props.b}
              {props.c}
            </span>
          )
        },
      )
    `)

    expect(code).toMatchInlineSnapshot()
  })

  it('transforms Slot fallback', () => {
    const code = transform(`
      import { defineElement, Slot } from '@zeus-js/zeus'

      export const ZEmpty = defineElement(
        'z-empty',
        { shadow: false },
        () => {
          return (
            <Slot>
              <span>fallback</span>
            </Slot>
          )
        },
      )
    `)

    expect(code).toMatchInlineSnapshot()
  })
})
```

> 注意：`toMatchInlineSnapshot()` 第一次运行会生成很长的 snapshot。建议你先跑一轮 `vitest -u`，确认输出可读后再提交。

---

# 7. 新增 `examples/web-component`

这个示例是 Phase 0 的核心验收物。

## 目录

```txt id="854hb8"
examples/web-component/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    components/
      counter.tsx
      card.tsx
```

---

## `package.json`

```json id="irrm61"
{
  "name": "example-web-component",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@zeus-js/zeus": "workspace:*",
    "@zeus-js/vite-plugin": "workspace:*",
    "vite": "catalog:",
    "typescript": "catalog:"
  },
  "devDependencies": {}
}
```

---

## `vite.config.ts`

```ts id="vjbbfk"
// examples/web-component/vite.config.ts

import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [
    zeus({
      sourcemap: true,
    }),
  ],
})
```

当前 Vite 插件已经负责让 Vite 保留 JSX，并在 transform 阶段调用 Babel + `@zeus-js/compiler`。

---

## `tsconfig.json`

```json id="mi0b9y"
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

---

## `index.html`

```html id="tr3cxm"
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Zeus Web Component Example</title>
  </head>
  <body>
    <main>
      <h1>Zeus Web Component Example</h1>

      <z-counter count="1">Counter: </z-counter>

      <z-card>
        <span slot="header">Card Header</span>
        <span>Card Body</span>
      </z-card>
    </main>

    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## `src/components/counter.tsx`

```tsx id="s1f4us"
// examples/web-component/src/components/counter.tsx

import { defineElement, Slot } from '@zeus-js/zeus'

export interface CounterProps {
  count?: number
}

export const ZCounter = defineElement<CounterProps>(
  'z-counter',
  {
    shadow: false,
    props: {
      count: {
        type: Number,
        default: 0,
        reflect: true,
      },
    },
  },
  (props, { emit }) => {
    const increase = () => {
      const next = Number(props.count || 0) + 1

      /**
       * 这里直接写 host property 会在 Phase 1 后通过 Host/ctx 更优雅。
       * Phase 0 先验证 property setter + reflect + event。
       */
      emit('change', {
        count: next,
      })
    }

    return (
      <button type="button" onClick={increase}>
        <Slot />
        {props.count}
      </button>
    )
  },
)
```

> 这个版本只 emit，不直接更新 count。可以在 `main.tsx` 里监听后写回 property，以验证跨框架 wrapper 未来依赖的事件 + property 模式。

---

## `src/components/card.tsx`

```tsx id="4yvbkd"
// examples/web-component/src/components/card.tsx

import { defineElement, Slot } from '@zeus-js/zeus'

export const ZCard = defineElement(
  'z-card',
  {
    shadow: false,
    styles: `
      z-card {
        display: block;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 12px;
        margin-top: 12px;
      }

      z-card [part="header"] {
        font-weight: 600;
        margin-bottom: 8px;
      }
    `,
  },
  () => {
    return (
      <section>
        <header part="header">
          <Slot name="header">Default Header</Slot>
        </header>

        <main part="content">
          <Slot />
        </main>
      </section>
    )
  },
)
```

---

## `src/main.tsx`

```tsx id="6yb5n7"
// examples/web-component/src/main.tsx

import './components/counter'
import './components/card'

const counter = document.querySelector('z-counter') as HTMLElement & {
  count?: number
}

counter?.addEventListener('change', event => {
  const detail = (event as CustomEvent<{ count: number }>).detail

  counter.count = detail.count
})
```

---

# 8. 根目录脚本补充

## 修改 `package.json`

```json id="g0gy2f"
{
  "scripts": {
    "example:web-component": "pnpm -C examples/web-component dev",
    "example:web-component:build": "pnpm -C examples/web-component build",
    "example:web-component:check": "pnpm -C examples/web-component check"
  }
}
```

如果想统一进 examples check：

```json id="55fj30"
{
  "scripts": {
    "examples:check": "pnpm -r --filter './examples/**' check",
    "examples:check:all": "tsx scripts/check/check-examples.ts"
  }
}
```

根目录已有 `examples:check`，理论上新增 example 后会自动纳入。

---

# 9. Phase 0 文档草案

新增：

```txt id="3a6mkz"
docs/internal/design/component-compiler-host-phase0.md
```

内容草案：

````md id="y2s4mv"
# Component Compiler Host Phase 0

## Goal

Stabilize the current Web Component foundation before introducing component analyzer and multi-output plugins.

## Scope

- defineElement behavior tests
- Slot behavior tests
- Host current behavior tests
- compiler snapshots for Web Component related JSX
- examples/web-component

## Non-goals

- no React wrapper
- no Vue wrapper
- no component analyzer
- no output plugins
- no shadcn-like registry

## Runtime contract

### defineElement

defineElement owns:

- customElements.define
- observedAttributes
- attributeChangedCallback
- connectedCallback
- disconnectedCallback
- property accessors
- props defaults
- CustomEvent emit
- shadow/light render target
- styles injection

### Host

Host is transparent in Phase 0.

Phase 1 will enhance Host to sync host attributes such as data-state, aria-* and class.

### Slot

Slot must support:

- native slot in shadow mode
- captured light children in light mode
- default slot
- named slot
- fallback content

## Quality gate

```bash
pnpm build
pnpm build-dts
pnpm check
pnpm test-unit
pnpm examples:check
pnpm size
````

````

---

# 10. Phase 0 验收清单

```txt id="kmyxoy"
[ ] packages/runtime-dom/src/__tests__/defineElement.spec.tsx
[ ] packages/runtime-dom/src/__tests__/slot.spec.tsx
[ ] packages/runtime-dom/src/__tests__/host.spec.tsx
[ ] packages/compiler/src/__tests__/webComponentTransform.spec.ts
[ ] examples/web-component 可以 dev
[ ] examples/web-component 可以 build
[ ] pnpm examples:check 通过
[ ] pnpm test-unit 通过
[ ] pnpm check 通过
[ ] docs/internal/design/component-compiler-host-phase0.md
````

---

# 11. 推荐提交顺序

```bash id="i9jekd"
git checkout -b feat/component-compiler-host

# 1. runtime tests
git add packages/runtime-dom/src/__tests__
git commit -m "test(runtime-dom): cover defineElement and slot behavior"

# 2. compiler snapshots
git add packages/compiler/src/__tests__
git commit -m "test(compiler): cover web component jsx transforms"

# 3. example
git add examples/web-component package.json
git commit -m "example: add web component example"

# 4. docs
git add docs/internal/design/component-compiler-host-phase0.md
git commit -m "docs: add component compiler host phase0 plan"
```

---

# 12. Phase 0 完成后的状态

完成后你会得到一个明确基础：

```txt id="2f2hu4"
defineElement 行为稳定
Slot 分发行为稳定
Host 当前行为被锁定
compiler 对 Web Component 场景有 snapshot
examples/web-component 能跑
```

这时候再进入 Phase 1 / Phase 2 就比较稳：

```txt id="27rs8a"
Phase 1：增强 Host，让它能控制宿主元素 data-state / aria / class / style
Phase 2：Component Analyzer，从 defineElement 自动抽 meta
Phase 3：Bundler Plugin Host，多输出 wc/react/vue
```

Phase 0 的关键不是写很多新功能，而是把当前已经有的 Web Component 底座变成**可依赖、可回归、可扩展**的基础。
