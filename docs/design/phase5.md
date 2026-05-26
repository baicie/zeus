下面给你 **Phase 5：Host / Slot / Web Components** 的详细设计与代码草案。

Phase 5 的核心目标是：

```txt id="h4jjip"
让 Zeus 组件可以编译/注册成原生 Web Component，并支持：
1. defineElement()
2. props / attributes 映射
3. shadow DOM / light DOM 两种模式
4. <Host> / <Slot> 内建组件
5. light DOM slot 模拟
6. 生命周期 cleanup
7. 自定义事件 emit
```

你当前仓库已经有这部分雏形：`runtime-dom` 里已经有 `defineElement()`，compiler IR 已经有 `HostIR / SlotIR`，`lowerBuiltin` 也已经识别 `Host / Slot`。

---

# Phase 5 总目标

最终用户应该能写：

```tsx id="bmur5x"
import { Host, Slot, defineElement, state } from '@zeus-js/zeus'

defineElement(
  'z-card',
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

然后原生 HTML 可以这样用：

```html id="gpf0ag"
<z-card title="Hello" active>
  <p>default slot content</p>
  <span slot="footer">custom footer</span>
</z-card>
```

---

# Phase 5 设计原则

## 1. `defineElement()` 是 Web Component 入口

不要要求用户自己写：

```ts id="dp0z2q"
class MyElement extends HTMLElement {}
customElements.define(...)
```

而是统一：

```ts id="w7d2ch"
defineElement('z-card', options, setup)
```

---

## 2. `<Host>` 是自定义元素模板根

Phase 5 MVP 里 `<Host>` 先作为 **语义包装节点**。

```tsx id="6mb0nr"
<Host>
  <div>...</div>
</Host>
```

MVP 阶段它可以编译成 children，本身不创建真实 DOM。
后续可以扩展：

```tsx id="5vbe2z"
<Host class={...} onClick={...}>
  ...
</Host>
```

用于绑定属性/事件到自定义元素本体，但 Phase 5.1 先不做。

---

## 3. `<Slot>` 同时支持 shadow DOM 和 light DOM

Web Components 原生 slot 只在 shadow DOM 里天然生效。

但你之前想要 **light DOM slots**，所以 Phase 5 设计成：

```txt id="x49sjr"
shadow: true
  -> 使用原生 <slot>

shadow: false
  -> Zeus runtime 捕获自定义元素原始子节点，并在 <Slot> 位置手动插入
```

也就是说：

```tsx id="9t6q9v"
<Slot />
<Slot name="footer" />
```

在 shadow DOM 下是真 slot，在 light DOM 下是 runtime 模拟投影。

---

## 4. props 是响应式的

外部 attribute 更新后，组件内部能响应：

```html id="qfgkyk"
<z-card title="A"></z-card>
```

JS：

```ts id="9lnlpj"
el.setAttribute('title', 'B')
```

组件里：

```tsx id="lswb5g"
<h2>{props.title}</h2>
```

应该更新。

所以 `defineElement()` 内部要把 props 做成：

```ts id="an5r7f"
const props = state({ ... })
```

---

# Phase 5 目录结构

建议新增 / 调整：

```txt id="0v0efn"
packages/runtime-dom/src/
  customElement.ts      # defineElement()
  hostContext.ts        # Web Component 渲染上下文
  slot.ts               # createSlot()
  controlFlow.ts        # Host / Slot runtime component 可放这里或单独文件
```

compiler 调整：

```txt id="3q8sis"
packages/compiler/src/codegen/dom/emitBuiltin.ts
  emitSlot() 改为 createSlot()

packages/compiler/src/lower/lowerBuiltin.ts
  Host / Slot 保持识别
```

zeus 入口导出：

```txt id="s66smr"
packages/zeus/src/index.ts
  export defineElement
  export Host
  export Slot
```

---

# 1. runtime-dom：hostContext.ts

这个文件负责保存当前正在渲染的 Web Component 上下文。

```ts id="m9fax7"
// packages/runtime-dom/src/hostContext.ts

import type { JSXValue } from './types'

export type HostRenderMode = 'light' | 'shadow'

export interface HostRenderContext {
  host: HTMLElement
  mode: HostRenderMode
  lightChildren: Node[]
}

let currentHostContext: HostRenderContext | undefined

export function getCurrentHostContext(): HostRenderContext | undefined {
  return currentHostContext
}

export function withHostContext<T>(
  context: HostRenderContext | undefined,
  fn: () => T,
): T {
  const previous = currentHostContext
  currentHostContext = context

  try {
    return fn()
  } finally {
    currentHostContext = previous
  }
}

export function captureCurrentHostContext(): HostRenderContext | undefined {
  return currentHostContext
}

export function withCapturedHostContext<T extends (...args: any[]) => any>(
  fn: T,
): T {
  const context = captureCurrentHostContext()

  return ((...args: Parameters<T>): ReturnType<T> => {
    return withHostContext(context, () => fn(...args))
  }) as T
}
```

为什么需要 `withCapturedHostContext()`？

因为 `<Slot>` 可能出现在 `<Show>` 或 `<For>` 的动态回调里：

```tsx id="1ubqj0"
<Show when={visible.value}>
  <Slot />
</Show>
```

`mountShow()` 里的 children 是之后 effect 里执行的，如果不捕获上下文，`createSlot()` 找不到当前 host。

---

# 2. runtime-dom：slot.ts

`createSlot()` 是 Slot 的 runtime 实现。

```ts id="v5xc8u"
// packages/runtime-dom/src/slot.ts

import { insert } from './insert'
import { getCurrentHostContext } from './hostContext'

import type { JSXValue } from './types'

export function createSlot(name?: string, fallback?: () => JSXValue): JSXValue {
  const context = getCurrentHostContext()

  if (!context) {
    return createNativeSlot(name, fallback)
  }

  if (context.mode === 'shadow') {
    return createNativeSlot(name, fallback)
  }

  const assigned = findLightSlotNodes(context.lightChildren, name)

  if (assigned.length > 0) {
    return assigned
  }

  return fallback ? fallback() : null
}

function createNativeSlot(
  name?: string,
  fallback?: () => JSXValue,
): HTMLSlotElement {
  const slot = document.createElement('slot')

  if (name) {
    slot.setAttribute('name', name)
  }

  const fallbackValue = fallback?.()

  if (fallbackValue != null) {
    insert(slot, fallbackValue)
  }

  return slot
}

function findLightSlotNodes(nodes: readonly Node[], name?: string): Node[] {
  if (name) {
    return nodes.filter(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false
      return (node as Element).getAttribute('slot') === name
    })
  }

  return nodes.filter(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return isMeaningfulTextNode(node)
    }

    return !(node as Element).hasAttribute('slot')
  })
}

function isMeaningfulTextNode(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return false
  return Boolean(node.textContent?.trim())
}
```

说明：

```txt id="tk4s8d"
shadow 模式：返回原生 <slot>
light 模式：返回 defineElement() 捕获到的原始子节点
```

MVP 限制：

```txt id="pl8lqj"
同一个 slot name 建议只使用一次。
重复使用同名 <Slot> 时，Node 会被移动到最后一次插入的位置。
```

---

# 3. runtime-dom：customElement.ts

这是 Phase 5 的核心。

```ts id="ng4l35"
// packages/runtime-dom/src/customElement.ts

import { onScopeDispose, state } from '@zeus-js/signal'

import { render } from './render'
import { withHostContext } from './hostContext'

import type { JSXValue } from './types'
import type { HostRenderContext } from './hostContext'

export type PropConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ObjectConstructor
  | ArrayConstructor

export type PropDefinition<T = unknown> =
  | PropConstructor
  | {
      type?: PropConstructor
      attr?: string | false
      reflect?: boolean
      default?: T | (() => T)
    }

export type PropOptions<P extends Record<string, unknown>> = Partial<{
  [K in keyof P]: PropDefinition<P[K]>
}>

export interface DefineElementOptions<P extends Record<string, unknown>> {
  shadow?: boolean | ShadowRootInit
  props?: PropOptions<P>
  styles?: string | string[]
}

export interface DefineElementContext<E extends HTMLElement = HTMLElement> {
  host: E
  emit: (name: string, detail?: unknown, options?: CustomEventInit) => boolean
}

export type DefineElementSetup<
  P extends Record<string, unknown>,
  E extends HTMLElement = HTMLElement,
> = (props: Readonly<P>, context: DefineElementContext<E>) => JSXValue

type NormalizedPropDefinition = {
  key: string
  attr: string | false
  type?: PropConstructor
  reflect: boolean
  default?: unknown
}

export function defineElement<
  P extends Record<string, unknown> = Record<string, unknown>,
  E extends HTMLElement = HTMLElement,
>(
  tagName: string,
  options: DefineElementOptions<P>,
  setup: DefineElementSetup<P, E>,
): CustomElementConstructor {
  const propDefs = normalizePropDefinitions(options.props ?? {})
  const observedAttributes = propDefs
    .filter(def => def.attr !== false)
    .map(def => def.attr as string)

  class ZeusElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return observedAttributes
    }

    private readonly props = state({}) as P
    private dispose?: () => void
    private target?: Element | ShadowRoot
    private lightChildren: Node[] = []
    private capturedLightChildren = false
    private reflecting = false

    constructor() {
      super()

      applyPropDefaults(this.props, propDefs)
      definePropAccessors(this, this.props, propDefs)
    }

    connectedCallback(): void {
      if (this.dispose) return

      const shadow = options.shadow ?? false
      const mode = shadow ? 'shadow' : 'light'

      if (mode === 'light' && !this.capturedLightChildren) {
        this.lightChildren = Array.from(this.childNodes)
        this.capturedLightChildren = true
      }

      this.syncAttributesToProps(propDefs)

      const target = this.resolveRenderTarget(shadow)

      mountStyles(target, options.styles)

      const hostContext: HostRenderContext = {
        host: this,
        mode,
        lightChildren: this.lightChildren,
      }

      const setupContext: DefineElementContext<E> = {
        host: this as unknown as E,
        emit: (name, detail, eventOptions) => {
          return this.dispatchEvent(
            new CustomEvent(name, {
              bubbles: true,
              composed: true,
              cancelable: true,
              ...eventOptions,
              detail,
            }),
          )
        },
      }

      this.dispose = render(
        () =>
          withHostContext(hostContext, () =>
            setup(this.props as Readonly<P>, setupContext),
          ),
        target,
      )

      onScopeDispose(() => {
        this.dispose?.()
        this.dispose = undefined
      }, true)
    }

    disconnectedCallback(): void {
      this.dispose?.()
      this.dispose = undefined
    }

    attributeChangedCallback(
      name: string,
      oldValue: string | null,
      newValue: string | null,
    ): void {
      if (oldValue === newValue || this.reflecting) return

      const def = propDefs.find(item => item.attr === name)

      if (!def) return
      ;(this.props as Record<string, unknown>)[def.key] = castAttributeValue(
        newValue,
        def,
      )
    }

    private resolveRenderTarget(
      shadow: boolean | ShadowRootInit,
    ): Element | ShadowRoot {
      if (this.target) return this.target

      if (!shadow) {
        this.target = this
        return this.target
      }

      this.target = this.attachShadow(
        typeof shadow === 'object' ? shadow : { mode: 'open' },
      )

      return this.target
    }

    private syncAttributesToProps(
      defs: readonly NormalizedPropDefinition[],
    ): void {
      for (const def of defs) {
        if (def.attr === false) continue

        const value = this.getAttribute(def.attr)

        if (value !== null || def.type === Boolean) {
          ;(this.props as Record<string, unknown>)[def.key] =
            castAttributeValue(value, def)
        }
      }
    }

    _writePropFromProperty(key: string, value: unknown): void {
      const def = propDefs.find(item => item.key === key)

      ;(this.props as Record<string, unknown>)[key] = value

      if (def?.reflect && def.attr !== false) {
        this.reflecting = true

        try {
          reflectPropToAttribute(this, def, value)
        } finally {
          this.reflecting = false
        }
      }
    }
  }

  if (!customElements.get(tagName)) {
    customElements.define(tagName, ZeusElement)
  }

  return ZeusElement
}

function normalizePropDefinitions<P extends Record<string, unknown>>(
  props: PropOptions<P>,
): NormalizedPropDefinition[] {
  return Object.keys(props).map(key => {
    const input = props[key as keyof P]

    if (typeof input === 'function') {
      return {
        key,
        attr: toKebabCase(key),
        type: input as PropConstructor,
        reflect: false,
      }
    }

    return {
      key,
      attr: input?.attr === undefined ? toKebabCase(key) : input.attr,
      type: input?.type,
      reflect: Boolean(input?.reflect),
      default: input?.default,
    }
  })
}

function applyPropDefaults(
  props: Record<string, unknown>,
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    if (!('default' in def)) continue

    const value =
      typeof def.default === 'function'
        ? (def.default as () => unknown)()
        : def.default

    props[def.key] = value
  }
}

function definePropAccessors(
  element: HTMLElement,
  props: Record<string, unknown>,
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    if (def.key in element) continue

    Object.defineProperty(element, def.key, {
      configurable: true,
      enumerable: true,
      get() {
        return props[def.key]
      },
      set(value: unknown) {
        ;(
          this as HTMLElement & {
            _writePropFromProperty: (key: string, value: unknown) => void
          }
        )._writePropFromProperty(def.key, value)
      },
    })
  }
}

function castAttributeValue(
  value: string | null,
  def: NormalizedPropDefinition,
): unknown {
  if (def.type === Boolean) {
    return value !== null
  }

  if (value === null) {
    return undefined
  }

  if (def.type === Number) {
    return Number(value)
  }

  if (def.type === Object || def.type === Array) {
    try {
      return JSON.parse(value)
    } catch {
      if (__DEV__) {
        console.warn(
          `[Zeus custom-element] Failed to parse JSON attribute "${def.attr}".`,
        )
      }

      return def.type === Array ? [] : {}
    }
  }

  return value
}

function reflectPropToAttribute(
  element: HTMLElement,
  def: NormalizedPropDefinition,
  value: unknown,
): void {
  if (def.attr === false) return

  if (def.type === Boolean) {
    if (value) {
      element.setAttribute(def.attr, '')
    } else {
      element.removeAttribute(def.attr)
    }

    return
  }

  if (value == null) {
    element.removeAttribute(def.attr)
    return
  }

  if (def.type === Object || def.type === Array) {
    element.setAttribute(def.attr, JSON.stringify(value))
    return
  }

  element.setAttribute(def.attr, String(value))
}

function mountStyles(
  target: Element | ShadowRoot,
  styles: string | string[] | undefined,
): void {
  if (!styles) return

  const list = Array.isArray(styles) ? styles : [styles]

  for (const css of list) {
    const style = document.createElement('style')
    style.textContent = css
    target.appendChild(style)
  }
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
```

---

# 4. runtime-dom：Host / Slot runtime component

虽然 compiler 会内建识别 `<Host>` / `<Slot>`，但 TypeScript 和 fallback JSX runtime 仍然需要真实导出。

```ts id="pp7cxm"
// packages/runtime-dom/src/webComponents.ts

import { createSlot } from './slot'

import type { JSXValue } from './types'

export interface HostProps {
  children?: JSXValue | (() => JSXValue)
}

export interface SlotProps {
  name?: string
  children?: JSXValue | (() => JSXValue)
}

export function Host(props: HostProps): JSXValue {
  return resolveValue(props.children)
}

export function Slot(props: SlotProps): JSXValue {
  return createSlot(props.name, () => resolveValue(props.children))
}

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : value
}
```

---

# 5. runtime-dom：mountDynamic 捕获 host context

Phase 5 要调整 Phase 2 的 `mountDynamic()`。

否则 `<Slot>` 放在 `<Show>` / `<For>` 里时找不到 host context。

```ts id="30e48t"
// packages/runtime-dom/src/insert.ts

import { effect, onScopeDispose, stop } from '@zeus-js/signal'

import { captureCurrentHostContext, withHostContext } from './hostContext'
import { removeNodes } from './dom'

import type { JSXValue } from './types'

export function mountDynamic(
  parent: Node,
  marker: Node,
  value: () => JSXValue,
): void {
  let current: Node[] = []
  const hostContext = captureCurrentHostContext()

  const runner = effect(() => {
    removeNodes(current)

    const next = withHostContext(hostContext, value)

    current = insertTracked(parent, next, marker)
  })

  onScopeDispose(() => {
    stop(runner)
    removeNodes(current)
    current = []
  }, true)
}
```

保留原来的 `insert()` / `insertTracked()` 即可。

---

# 6. runtime-dom：controlFlow 捕获上下文

如果 `mountShow()` / `mountFor()` 内部直接使用 `mountDynamic()`，只要 `mountDynamic()` 捕获 context，就够用。

```ts id="n2xrx7"
// packages/runtime-dom/src/controlFlow.ts

export function mountShow(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  fallback?: () => JSXValue,
): void {
  mountDynamic(parent, marker, () =>
    when() ? children() : fallback ? fallback() : null,
  )
}

export function mountFor<T>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  mountDynamic(
    parent,
    marker,
    () => each()?.map((item, index) => render(item, index)) ?? null,
  )
}
```

---

# 7. runtime-dom：index.ts 导出

```ts id="ae31qj"
// packages/runtime-dom/src/index.ts

export {
  defineElement,
  type DefineElementOptions,
  type DefineElementContext,
  type DefineElementSetup,
  type PropConstructor,
  type PropDefinition,
  type PropOptions,
} from './customElement'

export { Host, Slot, type HostProps, type SlotProps } from './webComponents'

export { createSlot } from './slot'

export {
  getCurrentHostContext,
  withHostContext,
  captureCurrentHostContext,
  withCapturedHostContext,
  type HostRenderContext,
  type HostRenderMode,
} from './hostContext'
```

同时保留 Phase 2 的其他导出。

---

# 8. compiler：emitSlot 改造

当前 `emitSlot()` 是直接生成 `<slot>` 模板。

Phase 5 要改成调用 runtime helper：

```ts id="5b31at"
// packages/compiler/src/codegen/dom/emitBuiltin.ts

import * as t from '@babel/types'

import { emitChildrenProp } from './emitComponent'

import type { CompilerContext } from '../../context'
import type { ForIR, HostIR, ShowIR, SlotIR } from '../../ir/nodes'

export function emitHost(node: HostIR, context: CompilerContext): t.Expression {
  return emitChildrenProp(node.children, context)
}

export function emitSlot(node: SlotIR, context: CompilerContext): t.Expression {
  return t.callExpression(context.importRuntime('createSlot'), [
    node.name ? t.stringLiteral(node.name) : t.identifier('undefined'),
    node.fallback.length > 0
      ? t.arrowFunctionExpression([], emitChildrenProp(node.fallback, context))
      : t.identifier('undefined'),
  ])
}
```

这样：

```tsx id="7nzh8k"
<Slot name="footer">
  <button>fallback</button>
</Slot>
```

会编译成：

```ts id="uo8chm"
_createSlot(
  "footer",
  () => ...
)
```

runtime 决定到底是原生 `<slot>`，还是 light DOM 投影。

---

# 9. compiler：lowerBuiltin 保持，但建议增强 Slot 校验

当前 `lowerBuiltin.ts` 已经识别：

```txt id="nvlnht"
Show
For
Host
Slot
```

并且 `Slot` 已经支持静态 `name` 属性。

Phase 5 建议加几个规则：

```txt id="ig16zc"
1. <Slot name="xxx" /> 支持
2. <Slot /> 默认 slot
3. <Slot name={expr} /> 暂不支持
4. <Host> 暂不支持 attrs
```

`lowerSlot()` 保持：

```ts id="s9u1kg"
function lowerSlot(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const name = optionalStringAttr(path, 'name')

  return slotIR({
    name,
    fallback: lowerChildren(path.get('children'), context),
  })
}
```

---

# 10. compiler：Host 属性暂缓

当前 `HostIR` 只有 children。

Phase 5 MVP 不建议扩 Host attrs，先保持：

```tsx id="m76eoe"
<Host>...</Host>
```

不支持：

```tsx id="py0tkq"
<Host class={...} onClick={...}>
```

后续 Phase 5.2 再加：

```ts id="aweii3"
export type HostIR = SemanticBaseIRNode & {
  kind: 'Host'
  attrs: AttributeIR[]
  children: ZeusIRNode[]
}
```

并在 runtime 增加：

```ts id="qlgenx"
getHostElement()
bindHostAttr()
bindHostEvent()
```

MVP 先不做，减少复杂度。

---

# 11. zeus 入口导出

`packages/zeus/src/index.ts` 增加：

```ts id="ux40qb"
export {
  defineElement,
  Host,
  Slot,
  type DefineElementOptions,
  type DefineElementContext,
  type DefineElementSetup,
  type HostProps,
  type SlotProps,
} from '@zeus-js/runtime-dom'
```

用户：

```ts id="xqq5gw"
import { defineElement, Host, Slot, state } from '@zeus-js/zeus'
```

---

# 12. JSX 类型补充

`packages/zeus/src/jsx.d.ts` 里增加 Web Component 相关类型。

```ts id="x1ferd"
import type { HostProps, SlotProps } from '@zeus-js/runtime-dom'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      slot: HTMLAttributes<HTMLSlotElement>
    }
  }
}

export type { HostProps, SlotProps }
```

对于 `<Host>` / `<Slot>`，因为它们是大写组件，需要用户 import：

```tsx id="e08yu9"
import { Host, Slot } from '@zeus-js/zeus'
```

---

# 13. 使用示例：light DOM slot

```tsx id="s7qg0n"
import { Host, Slot, defineElement } from '@zeus-js/zeus'

defineElement(
  'z-panel',
  {
    shadow: false,
    props: {
      title: String,
    },
  },
  props => {
    return (
      <Host>
        <section class="panel">
          <h2>{props.title}</h2>

          <main>
            <Slot />
          </main>

          <footer>
            <Slot name="footer">
              <span>default footer</span>
            </Slot>
          </footer>
        </section>
      </Host>
    )
  },
)
```

HTML：

```html id="zq7i4i"
<z-panel title="Hello">
  <p>content</p>
  <button slot="footer">ok</button>
</z-panel>
```

light DOM 模式下：

```txt id="eabppf"
<Slot /> 找到没有 slot 属性的原始子节点
<Slot name="footer" /> 找到 slot="footer" 的原始子节点
```

---

# 14. 使用示例：shadow DOM slot

```tsx id="w1jxwg"
defineElement(
  'z-card',
  {
    shadow: true,
    props: {
      title: String,
    },
    styles: `
      article {
        border: 1px solid #ddd;
        padding: 12px;
      }
    `,
  },
  props => {
    return (
      <Host>
        <article>
          <h2>{props.title}</h2>
          <Slot />
        </article>
      </Host>
    )
  },
)
```

shadow 模式下 `<Slot />` 返回原生 `<slot>`，浏览器负责 slot 分发。

---

# 15. 自定义事件 emit

```tsx id="iw9mwv"
defineElement(
  'z-counter',
  {
    props: {
      value: {
        type: Number,
        reflect: true,
        default: 0,
      },
    },
  },
  (props, ctx) => {
    return (
      <Host>
        <button
          onClick={() => {
            ctx.emit('change', {
              value: props.value,
            })
          }}
        >
          {props.value}
        </button>
      </Host>
    )
  },
)
```

外部监听：

```html id="jccv0l"
<z-counter id="counter"></z-counter>

<script>
  counter.addEventListener('change', event => {
    console.log(event.detail.value)
  })
</script>
```

---

# 16. 属性和 props 映射规则

## Boolean

```ts id="dp9iuh"
props: {
  active: Boolean
}
```

HTML：

```html id="lmhlkd"
<z-card active></z-card>
```

结果：

```ts id="xc7ry7"
props.active === true
```

移除：

```ts id="ne0dlu"
el.removeAttribute('active')
```

结果：

```ts id="z98c7m"
props.active === false
```

---

## Number

```ts id="qc6zl9"
props: {
  count: Number
}
```

HTML：

```html id="t6axz5"
<z-counter count="10"></z-counter>
```

结果：

```ts id="ehal0x"
props.count === 10
```

---

## String

```ts id="b1kgty"
props: {
  title: String
}
```

---

## Object / Array

```ts id="mdx2ki"
props: {
  config: Object,
  items: Array
}
```

HTML：

```html id="m3len4"
<z-list items='[{"id":1}]'></z-list>
```

内部 JSON.parse。

---

## 自定义 attr 名

```ts id="ukzffm"
props: {
  userName: {
    type: String,
    attr: 'user-name',
  }
}
```

---

## 不映射 attribute

```ts id="v5xkrh"
props: {
  data: {
    type: Object,
    attr: false,
  }
}
```

只能通过 property 设置：

```ts id="h78d85"
el.data = { a: 1 }
```

---

# 17. 测试规划

新增：

```txt id="uv09ln"
packages/runtime-dom/__tests__/
  customElement.spec.ts
  slot.spec.ts
  hostContext.spec.ts

packages/compiler/__tests__/
  web-component.spec.ts
```

---

## 17.1 customElement.spec.ts

```ts id="2qk2kx"
import { describe, expect, it, vi } from 'vitest'

import {
  Host,
  Slot,
  defineElement,
} from '../src'

describe('defineElement', () => {
  it('defines custom element with reactive props', async () => {
    defineElement(
      'z-test-title',
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

    const el = document.createElement('z-test-title')
    el.setAttribute('title', 'Hello')

    document.body.appendChild(el)

    expect(el.textContent).toContain('Hello')

    el.setAttribute('title', 'World')

    expect(el.textContent).toContain('World')

    el.remove()
  })

  it('emits custom events', () => {
    defineElement(
      'z-test-event',
      {},
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

    const el = document.createElement('z-test-event')
    const fn = vi.fn()

    el.addEventListener('select', fn)
    document.body.appendChild(el)

    el.querySelector('button')!.click()

    expect(fn).toHaveBeenCalledTimes(1)
    expect((fn.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 1 })

    el.remove()
  })
})
```

---

## 17.2 slot.spec.ts

```ts id="dzravx"
import { describe, expect, it } from 'vitest'

import {
  Host,
  Slot,
  defineElement,
} from '../src'

describe('light DOM slot', () => {
  it('projects default slot children', () => {
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

    p.textContent = 'hello'
    el.appendChild(p)

    document.body.appendChild(el)

    expect(el.querySelector('section')!.textContent).toContain('hello')

    el.remove()
  })

  it('projects named slot children', () => {
    defineElement(
      'z-test-slot-named',
      {
        shadow: false,
      },
      () => (
        <Host>
          <footer>
            <Slot name="footer" />
          </footer>
        </Host>
      ),
    )

    const el = document.createElement('z-test-slot-named')
    const span = document.createElement('span')

    span.setAttribute('slot', 'footer')
    span.textContent = 'footer content'
    el.appendChild(span)

    document.body.appendChild(el)

    expect(el.querySelector('footer')!.textContent).toContain('footer content')

    el.remove()
  })

  it('renders fallback when no slot content exists', () => {
    defineElement(
      'z-test-slot-fallback',
      {
        shadow: false,
      },
      () => (
        <Host>
          <Slot name="footer">
            <span>fallback</span>
          </Slot>
        </Host>
      ),
    )

    const el = document.createElement('z-test-slot-fallback')

    document.body.appendChild(el)

    expect(el.textContent).toContain('fallback')

    el.remove()
  })
})
```

---

## 17.3 compiler web-component snapshot

```ts id="1lzs8h"
it('compiles Slot to createSlot', async () => {
  const code = `
    import { Host, Slot } from '@zeus-js/zeus'

    const App = () => (
      <Host>
        <article>
          <Slot />
          <Slot name="footer">
            <button>fallback</button>
          </Slot>
        </article>
      </Host>
    )
  `

  expect(await compile(code)).toMatchSnapshot()
})
```

期望包含：

```ts id="vb3oat"
_createSlot(undefined, undefined)

_createSlot(
  "footer",
  () => ...
)
```

---

# 18. Phase 5 任务拆分

## Phase 5.1：runtime host context

```txt id="tslujp"
- 新增 hostContext.ts
- 支持 getCurrentHostContext()
- 支持 withHostContext()
- 支持捕获上下文给动态回调使用
```

---

## Phase 5.2：runtime createSlot

```txt id="l9h2cy"
- shadow 模式返回原生 <slot>
- light 模式查找 captured light children
- 支持 default slot
- 支持 named slot
- 支持 fallback
```

---

## Phase 5.3：defineElement 升级

```txt id="pfbcwq"
- props option 标准化
- observedAttributes
- attributeChangedCallback
- property accessor
- Boolean/Number/String/Object/Array 转换
- reflect
- shadow / light target
- style injection
- emit()
- cleanup
```

---

## Phase 5.4：compiler Slot 改造

```txt id="r9casf"
- emitSlot() 从原生 <slot> 模板改成 createSlot()
- Host 保持 no-op wrapper
- 补 snapshot
```

---

## Phase 5.5：zeus 入口导出

```txt id="qiml7i"
- export defineElement
- export Host
- export Slot
- export 相关类型
```

---

## Phase 5.6：测试

```txt id="idd41w"
- defineElement reactive props
- attribute -> prop
- property -> prop
- reflect
- event emit
- shadow slot
- light default slot
- light named slot
- fallback slot
- disconnect cleanup
```

---

# 19. Phase 5 完成标准

下面代码能跑通，Phase 5 就算完成：

```tsx id="y6unqn"
import { Host, Slot, defineElement, state } from '@zeus-js/zeus'

defineElement(
  'z-user-card',
  {
    shadow: false,
    props: {
      name: String,
      active: Boolean,
    },
  },
  (props, ctx) => {
    const count = state(0)

    return (
      <Host>
        <article class={{ active: props.active }}>
          <h2>{props.name}</h2>

          <Slot />

          <Slot name="footer">
            <button onClick={() => count.value++}>count: {count.value}</button>
          </Slot>

          <button
            onClick={() => {
              ctx.emit('select', {
                name: props.name,
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

HTML：

```html id="hvqyz8"
<z-user-card name="Zeus" active>
  <p>content</p>
  <span slot="footer">footer</span>
</z-user-card>
```

满足：

```txt id="uphz55"
1. props.name 读取 attribute name
2. active 转 boolean
3. attribute 变化能触发 DOM 更新
4. <Slot /> 渲染默认 light children
5. <Slot name="footer" /> 渲染命名 light children
6. fallback 能生效
7. ctx.emit() 能抛 CustomEvent
8. disconnectedCallback 能清理 effects / listeners / refs
9. shadow: true 时使用原生 slot
10. shadow: false 时使用 Zeus light DOM slot 模拟
```

---

# 20. 最终结论

Phase 5 的核心是：

```txt id="ccxvkx"
把 Zeus 从“能编译普通 JSX”推进到“能产出原生 Web Components”。
```

最终架构是：

```txt id="bmbnc5"
defineElement()
  ↓
创建自定义元素 class
  ↓
attribute/property -> reactive props
  ↓
setup(props, ctx) 返回 TSX
  ↓
compiler 编译 Host/Slot
  ↓
runtime-dom 渲染到 light DOM 或 shadow DOM
  ↓
slot 由 native slot 或 Zeus light slot 完成
```

这一步做完，Zeus 就具备一个非常有辨识度的方向：

```txt id="67rzhy"
Vue-like state()
+
Solid-style compiled DOM update
+
Web Components 输出能力
+
light DOM slot 支持
```
