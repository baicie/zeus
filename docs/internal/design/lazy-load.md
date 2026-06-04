下面这版是我建议 Zeus 最终采用的 **Stencil-style Web-C 懒加载方案**。

核心结论先定死：

```txt id="ndw6u1"
1. defineCustomElements / auto 由组件库产物提供，不由 @zeus-js/web-c-runtime 提供。
2. @zeus-js/web-c-runtime 只提供 bootstrapLazy、HostRef、Proxy Element、生命周期桥接能力。
3. register: lazy 的含义是：
   启动时 define 轻量 Proxy Custom Element；
   真实组件实现等 <zw-button> connectedCallback 时再 import。
4. Vue / React wrapper 默认 minimal，不再 watch / syncProps / addEventListener。
5. types 默认 true。
```

---

# 1. 最终包职责

```txt id="gn41ee"
@zeus-js/web-c-runtime
  Zeus 底层运行时
  不知道任何组件库有哪些组件
  只提供 bootstrapLazy / HostRef / ProxyElement

@zeus-ui/web-c
  组件库 Web-C 产物
  由 Zeus compiler 生成
  提供 loader / auto / manifest / entry chunks

@zeus-ui/vue
  组件库 Vue 入口
  可选 wrapper
  内部可调用 @zeus-ui/web-c/loader

@zeus-ui/react
  组件库 React 入口
  可选 wrapper
  内部可调用 @zeus-ui/web-c/loader
```

最终用户体验：

```ts id="tyr7kw"
// Vue / React / 原生项目入口
import '@zeus-ui/web-c/auto'
```

然后直接写：

```html id="s945os"
<zw-button size="md" variant="primary"> Submit </zw-button>
```

此时：

```txt id="rg1tmb"
import "@zeus-ui/web-c/auto"
  -> 注册 zw-button 的 ProxyClass
  -> 不加载 zw-button.entry.js

<zw-button> 进入 DOM
  -> ProxyClass.connectedCallback()
  -> import("./zw-button.entry.js")
  -> 创建真实组件实例
  -> render
```

---

# 2. 产物结构

```txt id="ut4s68"
packages/
  web-c-runtime/
    src/
      types.ts
      host-ref.ts
      props.ts
      lifecycle.ts
      lazy-element.ts
      bootstrapLazy.ts
      index.ts

组件库 dist 示例：
@zeus-ui/web-c/
  loader.js
  auto.js
  components.manifest.js
  zw-button.entry.js
  zw-input.entry.js
  types/
    dom.d.ts
    jsx.d.ts
    vue.d.ts
    react.d.ts

@zeus-ui/vue/
  index.js
  zw-button.js

@zeus-ui/react/
  index.js
  setup.js
  zw-button.js
```

---

# 3. 编译配置最终版

```ts id="q1dxkq"
// packages/web-c/compiler-shared/src/options.ts

export type WebCRegisterMode = 'lazy' | 'manual' | 'side-effect'

export type WebCWrapperMode = 'minimal' | 'event-bridge'

export interface WebCCompileOptions {
  /**
   * lazy:
   *   默认值。生成 Stencil-style lazy loader。
   *   启动时注册轻量 ProxyClass，connected 时加载真实组件 entry。
   *
   * manual:
   *   只生成手动 define API。
   *
   * side-effect:
   *   import 后立即注册完整组件，兼容旧行为，不推荐默认使用。
   */
  register?: WebCRegisterMode

  /**
   * minimal:
   *   默认值。Vue / React wrapper 只做标签透传。
   *
   * event-bridge:
   *   后续增强模式，主要用于 React CustomEvent 桥接。
   */
  wrapper?: WebCWrapperMode

  /**
   * 默认生成 Vue / React / JSX / DOM 类型。
   */
  types?: boolean

  /**
   * 是否生成组件库 auto 入口。
   */
  autoEntry?: boolean
}

export const DEFAULT_WEB_C_COMPILE_OPTIONS: Required<WebCCompileOptions> = {
  register: 'lazy',
  wrapper: 'minimal',
  types: true,
  autoEntry: true,
}

export function resolveWebCCompileOptions(
  options: WebCCompileOptions = {},
): Required<WebCCompileOptions> {
  return {
    ...DEFAULT_WEB_C_COMPILE_OPTIONS,
    ...options,
  }
}
```

---

# 4. `@zeus-js/web-c-runtime` 完整核心代码

## 4.1 `types.ts`

```ts id="wilfen"
// packages/web-c-runtime/src/types.ts

export type ZeusPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'unknown'

export interface ZeusPropMeta {
  name: string
  attrName?: string
  type: ZeusPropType
  reflect?: boolean
  required?: boolean
  default?: unknown
}

export interface ZeusEventMeta {
  name: string
}

export interface ZeusSlotMeta {
  name: string
}

export interface ZeusLazyComponentMeta {
  tagName: string

  /**
   * 真实组件实现 chunk。
   * 这个函数必须由组件库 manifest 显式生成，避免 runtime 拼动态路径。
   */
  load: () => Promise<ZeusComponentModule | { default: ZeusComponentModule }>

  props: ZeusPropMeta[]
  events?: ZeusEventMeta[]
  slots?: ZeusSlotMeta[]

  /**
   * 默认建议 true。
   */
  shadow?: boolean
}

export interface HostRef {
  host: HTMLElement
  meta: ZeusLazyComponentMeta

  connected: boolean
  loaded: boolean
  loading?: Promise<void>

  instance?: ZeusComponentInstance

  values: Map<string, unknown>

  queuedAttrs: Array<{
    name: string
    oldValue: string | null
    newValue: string | null
  }>

  reflectingAttrs: Set<string>
}

export interface ZeusComponentInstance {
  connected?(): void
  disconnected?(): void

  attributeChanged?(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void

  propertyChanged?(name: string, oldValue: unknown, newValue: unknown): void

  /**
   * 可以返回 Node / Node[] / string。
   * 如果组件自己完成渲染，也可以返回 void。
   */
  render?(): void | string | Node | Node[]

  dispose?(): void
}

export interface ZeusComponentModule {
  createComponent(hostRef: HostRef): ZeusComponentInstance
}

export interface BootstrapLazyOptions {
  registry?: CustomElementRegistry
}
```

---

## 4.2 `host-ref.ts`

```ts id="if1qku"
// packages/web-c-runtime/src/host-ref.ts

import type { HostRef, ZeusLazyComponentMeta } from './types'

const hostRefs = new WeakMap<HTMLElement, HostRef>()

export function registerHost(
  host: HTMLElement,
  meta: ZeusLazyComponentMeta,
): HostRef {
  const existing = hostRefs.get(host)

  if (existing) {
    return existing
  }

  const hostRef: HostRef = {
    host,
    meta,
    connected: false,
    loaded: false,
    values: new Map(),
    queuedAttrs: [],
    reflectingAttrs: new Set(),
  }

  hostRefs.set(host, hostRef)

  return hostRef
}

export function getHostRef(host: HTMLElement): HostRef | undefined {
  return hostRefs.get(host)
}

export function requireHostRef(host: HTMLElement): HostRef {
  const hostRef = getHostRef(host)

  if (!hostRef) {
    throw new Error(
      `[zeus:web-c] hostRef not found for <${host.tagName.toLowerCase()}>.`,
    )
  }

  return hostRef
}
```

---

## 4.3 `props.ts`

```ts id="kl9cwp"
// packages/web-c-runtime/src/props.ts

import { requireHostRef } from './host-ref'
import type { HostRef, ZeusPropMeta } from './types'

export function installPropertyAccessors(
  proto: HTMLElement,
  props: ZeusPropMeta[],
): void {
  for (const prop of props) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop.name)

    if (descriptor) {
      continue
    }

    Object.defineProperty(proto, prop.name, {
      get(this: HTMLElement) {
        const hostRef = requireHostRef(this)
        return getPropValue(hostRef, prop)
      },

      set(this: HTMLElement, value: unknown) {
        const hostRef = requireHostRef(this)
        setPropValue(hostRef, prop, value)
      },

      configurable: true,
      enumerable: true,
    })
  }
}

export function getPropValue(hostRef: HostRef, prop: ZeusPropMeta): unknown {
  if (hostRef.values.has(prop.name)) {
    return hostRef.values.get(prop.name)
  }

  return prop.default
}

export function setPropValue(
  hostRef: HostRef,
  prop: ZeusPropMeta,
  value: unknown,
): void {
  const oldValue = getPropValue(hostRef, prop)

  if (Object.is(oldValue, value)) {
    return
  }

  hostRef.values.set(prop.name, value)

  if (prop.reflect) {
    reflectPropertyToAttribute(hostRef, prop, value)
  }

  if (hostRef.loaded) {
    hostRef.instance?.propertyChanged?.(prop.name, oldValue, value)
  }
}

export function syncAttributeToProperty(
  hostRef: HostRef,
  attrName: string,
  oldValue: string | null,
  newValue: string | null,
): void {
  if (hostRef.reflectingAttrs.has(attrName)) {
    return
  }

  const prop = findPropByAttrName(hostRef, attrName)

  if (!prop) {
    return
  }

  const oldPropValue = getPropValue(hostRef, prop)
  const newPropValue = parseAttributeValue(prop, newValue)

  if (!Object.is(oldPropValue, newPropValue)) {
    hostRef.values.set(prop.name, newPropValue)

    if (hostRef.loaded) {
      hostRef.instance?.propertyChanged?.(prop.name, oldPropValue, newPropValue)
    }
  }

  if (hostRef.loaded) {
    hostRef.instance?.attributeChanged?.(attrName, oldValue, newValue)
  } else {
    hostRef.queuedAttrs.push({
      name: attrName,
      oldValue,
      newValue,
    })
  }
}

export function applyInitialValues(hostRef: HostRef): void {
  const host = hostRef.host

  for (const prop of hostRef.meta.props) {
    if (hostRef.values.has(prop.name)) {
      continue
    }

    const attrName = prop.attrName ?? prop.name

    if (host.hasAttribute(attrName)) {
      hostRef.values.set(
        prop.name,
        parseAttributeValue(prop, host.getAttribute(attrName)),
      )
      continue
    }

    if ('default' in prop) {
      hostRef.values.set(prop.name, prop.default)
    }
  }
}

export function replayQueuedAttributes(hostRef: HostRef): void {
  const queuedAttrs = hostRef.queuedAttrs
  hostRef.queuedAttrs = []

  for (const attr of queuedAttrs) {
    hostRef.instance?.attributeChanged?.(
      attr.name,
      attr.oldValue,
      attr.newValue,
    )
  }
}

function findPropByAttrName(
  hostRef: HostRef,
  attrName: string,
): ZeusPropMeta | undefined {
  return hostRef.meta.props.find(prop => {
    return (prop.attrName ?? prop.name).toLowerCase() === attrName
  })
}

function parseAttributeValue(
  prop: ZeusPropMeta,
  value: string | null,
): unknown {
  switch (prop.type) {
    case 'boolean':
      return value !== null

    case 'number':
      if (value === null || value === '') {
        return undefined
      }

      return Number(value)

    case 'string':
      return value ?? undefined

    default:
      return value
  }
}

function reflectPropertyToAttribute(
  hostRef: HostRef,
  prop: ZeusPropMeta,
  value: unknown,
): void {
  const host = hostRef.host
  const attrName = prop.attrName ?? prop.name

  hostRef.reflectingAttrs.add(attrName)

  try {
    if (prop.type === 'boolean') {
      host.toggleAttribute(attrName, Boolean(value))
      return
    }

    if (value === null || value === undefined || value === false) {
      host.removeAttribute(attrName)
      return
    }

    if (prop.type === 'string' || prop.type === 'number') {
      host.setAttribute(attrName, String(value))
    }
  } finally {
    hostRef.reflectingAttrs.delete(attrName)
  }
}
```

---

## 4.4 `lifecycle.ts`

```ts id="ws4jr9"
// packages/web-c-runtime/src/lifecycle.ts

import { applyInitialValues, replayQueuedAttributes } from './props'
import type { HostRef, ZeusComponentModule } from './types'

const moduleCache = new WeakMap<HostRef['meta'], Promise<ZeusComponentModule>>()

export async function initializeComponent(hostRef: HostRef): Promise<void> {
  if (hostRef.loaded) {
    hostRef.instance?.connected?.()
    return
  }

  if (hostRef.loading) {
    await hostRef.loading
    return
  }

  hostRef.loading = doInitializeComponent(hostRef).finally(() => {
    if (!hostRef.loaded) {
      hostRef.loading = undefined
    }
  })

  await hostRef.loading
}

async function doInitializeComponent(hostRef: HostRef): Promise<void> {
  applyInitialValues(hostRef)

  const mod = await loadComponentModule(hostRef)

  if (!hostRef.connected) {
    return
  }

  const instance = mod.createComponent(hostRef)

  hostRef.instance = instance
  hostRef.loaded = true

  replayQueuedAttributes(hostRef)

  instance.connected?.()

  const rendered = instance.render?.()

  if (rendered !== undefined) {
    mountRenderedOutput(hostRef, rendered)
  }
}

async function loadComponentModule(
  hostRef: HostRef,
): Promise<ZeusComponentModule> {
  let pending = moduleCache.get(hostRef.meta)

  if (!pending) {
    pending = hostRef.meta.load().then(mod => {
      return 'default' in mod ? mod.default : mod
    })

    moduleCache.set(hostRef.meta, pending)
  }

  return pending
}

function mountRenderedOutput(
  hostRef: HostRef,
  rendered: string | Node | Node[],
): void {
  const root = getRenderRoot(hostRef)

  if (typeof rendered === 'string') {
    root.innerHTML = rendered
    return
  }

  if (Array.isArray(rendered)) {
    root.replaceChildren(...rendered)
    return
  }

  root.replaceChildren(rendered)
}

function getRenderRoot(hostRef: HostRef): ShadowRoot | HTMLElement {
  if (!hostRef.meta.shadow) {
    return hostRef.host
  }

  return (
    hostRef.host.shadowRoot ??
    hostRef.host.attachShadow({
      mode: 'open',
    })
  )
}
```

---

## 4.5 `lazy-element.ts`

```ts id="kz742e"
// packages/web-c-runtime/src/lazy-element.ts

import { registerHost, requireHostRef } from './host-ref'
import { initializeComponent } from './lifecycle'
import { installPropertyAccessors, syncAttributeToProperty } from './props'
import type { ZeusLazyComponentMeta } from './types'

export function createLazyElementClass(
  meta: ZeusLazyComponentMeta,
): CustomElementConstructor {
  const observedAttributes = meta.props
    .map(prop => prop.attrName ?? prop.name)
    .map(name => name.toLowerCase())

  class ZeusLazyElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return observedAttributes
    }

    constructor() {
      super()
      registerHost(this, meta)
    }

    connectedCallback(): void {
      const hostRef = requireHostRef(this)

      hostRef.connected = true

      void initializeComponent(hostRef)
    }

    disconnectedCallback(): void {
      const hostRef = requireHostRef(this)

      hostRef.connected = false

      if (hostRef.loaded) {
        hostRef.instance?.disconnected?.()
      }
    }

    attributeChangedCallback(
      name: string,
      oldValue: string | null,
      newValue: string | null,
    ): void {
      if (oldValue === newValue) {
        return
      }

      const hostRef = requireHostRef(this)

      syncAttributeToProperty(hostRef, name, oldValue, newValue)
    }

    componentOnReady(): Promise<HTMLElement> {
      const hostRef = requireHostRef(this)

      return initializeComponent(hostRef).then(() => this)
    }
  }

  installPropertyAccessors(
    ZeusLazyElement.prototype as unknown as HTMLElement,
    meta.props,
  )

  return ZeusLazyElement
}
```

---

## 4.6 `bootstrapLazy.ts`

```ts id="c4y0p9"
// packages/web-c-runtime/src/bootstrapLazy.ts

import { createLazyElementClass } from './lazy-element'
import type { BootstrapLazyOptions, ZeusLazyComponentMeta } from './types'

export function bootstrapLazy(
  components: ZeusLazyComponentMeta[],
  options: BootstrapLazyOptions = {},
): void {
  const registry = options.registry ?? customElements

  for (const meta of components) {
    if (registry.get(meta.tagName)) {
      continue
    }

    const LazyElement = createLazyElementClass(meta)

    registry.define(meta.tagName, LazyElement)
  }
}
```

---

## 4.7 `index.ts`

```ts id="l5pfnj"
// packages/web-c-runtime/src/index.ts

export { bootstrapLazy } from './bootstrapLazy'
export { createLazyElementClass } from './lazy-element'

export type {
  BootstrapLazyOptions,
  HostRef,
  ZeusComponentInstance,
  ZeusComponentModule,
  ZeusEventMeta,
  ZeusLazyComponentMeta,
  ZeusPropMeta,
  ZeusPropType,
  ZeusSlotMeta,
} from './types'
```

---

# 5. 组件库生成产物：`@zeus-ui/web-c`

下面这些不是 Zeus runtime 写死的，而是 Zeus compiler 给组件库生成出来的。

---

## 5.1 `components.manifest.ts`

```ts id="d7yusd"
// @zeus-ui/web-c/components.manifest.ts

import type { ZeusLazyComponentMeta } from '@zeus-js/web-c-runtime'

export const components: ZeusLazyComponentMeta[] = [
  {
    tagName: 'zw-button',
    shadow: true,
    load: () => import('./zw-button.entry.js'),
    props: [
      {
        name: 'disabled',
        attrName: 'disabled',
        type: 'boolean',
        reflect: true,
        default: false,
      },
      {
        name: 'size',
        attrName: 'size',
        type: 'string',
        reflect: true,
        default: 'md',
      },
      {
        name: 'variant',
        attrName: 'variant',
        type: 'string',
        reflect: true,
        default: 'default',
      },
    ],
    events: [
      {
        name: 'press',
      },
    ],
    slots: [
      {
        name: 'default',
      },
    ],
  },
]
```

---

## 5.2 `loader.ts`

```ts id="f8pj68"
// @zeus-ui/web-c/loader.ts

import { bootstrapLazy } from '@zeus-js/web-c-runtime'
import { components } from './components.manifest.js'

const ZEUS_UI_DEFINE_KEY = Symbol.for('zeus-ui.web-c.defined')

interface ZeusUIDefineState {
  defined?: boolean
}

function getGlobalDefineState(): ZeusUIDefineState {
  const globalObject = globalThis as typeof globalThis & {
    [ZEUS_UI_DEFINE_KEY]?: ZeusUIDefineState
  }

  globalObject[ZEUS_UI_DEFINE_KEY] ??= {}

  return globalObject[ZEUS_UI_DEFINE_KEY]
}

export interface DefineCustomElementsOptions {
  registry?: CustomElementRegistry
}

export function defineCustomElements(
  options: DefineCustomElementsOptions = {},
): void {
  const state = getGlobalDefineState()

  if (state.defined) {
    return
  }

  state.defined = true

  bootstrapLazy(components, {
    registry: options.registry ?? customElements,
  })
}

export const defineLazyElements = defineCustomElements
```

这里的 `defineCustomElements` 是 **组件库 API**。

用户如果直接用：

```ts id="rsnzwg"
import { defineCustomElements } from '@zeus-ui/web-c/loader'

defineCustomElements()
```

这是合法的。

---

## 5.3 `auto.ts`

```ts id="yp9hy8"
// @zeus-ui/web-c/auto.ts

import { defineCustomElements } from './loader.js'

defineCustomElements()

export {}
```

推荐用户使用：

```ts id="j2lgor"
import '@zeus-ui/web-c/auto'
```

这个入口只注册 proxy，不加载真实组件 entry。

---

## 5.4 `zw-button.entry.ts`

```ts id="kkd43o"
// @zeus-ui/web-c/zw-button.entry.ts

import type {
  HostRef,
  ZeusComponentInstance,
  ZeusComponentModule,
} from '@zeus-js/web-c-runtime'

class ZwButtonComponent implements ZeusComponentInstance {
  private hostRef: HostRef

  constructor(hostRef: HostRef) {
    this.hostRef = hostRef
  }

  connected(): void {
    this.render()
  }

  disconnected(): void {
    // 当前示例没有外部长生命周期资源。
    // 后续如果有 effect、timer、document listener，在这里 cleanup。
  }

  propertyChanged(): void {
    this.render()
  }

  attributeChanged(): void {
    this.render()
  }

  render(): void {
    const host = this.hostRef.host as HTMLElement & {
      disabled?: boolean
      size?: string
      variant?: string
    }

    const root =
      host.shadowRoot ??
      host.attachShadow({
        mode: 'open',
      })

    const disabled = Boolean(host.disabled)
    const size = host.size ?? 'md'
    const variant = host.variant ?? 'default'

    const style = document.createElement('style')
    style.textContent = `
      :host {
        display: inline-block;
      }

      button {
        box-sizing: border-box;
        border: 1px solid #d0d0d0;
        border-radius: 6px;
        background: #fff;
        color: #111;
        cursor: pointer;
        font: inherit;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .zw-button--sm {
        padding: 4px 8px;
        font-size: 12px;
      }

      .zw-button--md {
        padding: 6px 12px;
        font-size: 14px;
      }

      .zw-button--lg {
        padding: 8px 16px;
        font-size: 16px;
      }

      .zw-button--primary {
        border-color: #111;
        background: #111;
        color: #fff;
      }

      .zw-button--danger {
        border-color: #b00020;
        background: #b00020;
        color: #fff;
      }
    `

    const button = document.createElement('button')
    button.part.add('button')
    button.className = [
      'zw-button',
      `zw-button--${size}`,
      `zw-button--${variant}`,
    ].join(' ')

    button.disabled = disabled

    const slot = document.createElement('slot')

    button.appendChild(slot)

    button.addEventListener('click', () => {
      if (button.disabled) {
        return
      }

      host.dispatchEvent(
        new CustomEvent('press', {
          bubbles: true,
          composed: true,
        }),
      )
    })

    root.replaceChildren(style, button)
  }
}

export function createComponent(hostRef: HostRef): ZeusComponentInstance {
  return new ZwButtonComponent(hostRef)
}

export default {
  createComponent,
} satisfies ZeusComponentModule
```

重点：这里没有：

```ts id="e246o1"
customElements.define("zw-button", ...)
```

真实组件 entry 只导出 `createComponent()`。

---

# 6. Vue 入口：`@zeus-ui/vue`

Vue wrapper 是可选的。
如果用户直接写 `<zw-button>`，只需要组件库 auto 或 Vue plugin 帮忙调用 loader。

---

## 6.1 `zw-button.ts`

```ts id="wjk2d9"
// @zeus-ui/vue/zw-button.ts

import { defineComponent, h } from 'vue'

export const ZwButton = defineComponent({
  name: 'ZwButton',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    size: String,
    variant: String,
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'zw-button',
        {
          ...attrs,
          ...props,
        },
        slots.default?.(),
      )
  },
})
```

没有：

```txt id="zor23w"
watch
syncProps
ref
onMounted
onBeforeUnmount
addEventListener
removeEventListener
cloneVNode
```

---

## 6.2 `index.ts`

```ts id="co39uq"
// @zeus-ui/vue/index.ts

import type { App } from 'vue'
import { defineCustomElements } from '@zeus-ui/web-c/loader'
import { ZwButton } from './zw-button.js'

export interface ZeusUIVueOptions {
  /**
   * 默认 true。
   * 内部调用 @zeus-ui/web-c/loader 的 defineCustomElements。
   */
  defineCustomElements?: boolean

  /**
   * 默认 true。
   * 是否注册 Vue PascalCase wrapper。
   */
  registerComponents?: boolean
}

export function createZeusUIVuePlugin(options: ZeusUIVueOptions = {}) {
  const shouldDefine = options.defineCustomElements ?? true
  const shouldRegister = options.registerComponents ?? true

  return {
    install(app: App): void {
      if (shouldDefine) {
        defineCustomElements()
      }

      if (shouldRegister) {
        app.component('ZwButton', ZwButton)
      }
    },
  }
}

const ZeusUIVue = createZeusUIVuePlugin()

export { ZwButton }

export default ZeusUIVue
```

Vue 用户有两种写法。

### 原生 custom element 标签

```vue id="uil0oe"
<template>
  <zw-button size="md">Submit</zw-button>
</template>
```

入口：

```ts id="fcvk3a"
import { createApp } from 'vue'
import App from './App.vue'
import ZeusUI from '@zeus-ui/vue'

createApp(App).use(ZeusUI).mount('#app')
```

### Vue wrapper

```vue id="xiqorh"
<template>
  <ZwButton size="md">Submit</ZwButton>
</template>
```

底层还是渲染成 `<zw-button>`。

---

# 7. React 入口：`@zeus-ui/react`

---

## 7.1 `setup.ts`

```ts id="lyhwo0"
// @zeus-ui/react/setup.ts

import { defineCustomElements } from '@zeus-ui/web-c/loader'

let initialized = false

export function setupZeusUI(): void {
  if (initialized) {
    return
  }

  initialized = true

  defineCustomElements()
}
```

---

## 7.2 `zw-button.tsx`

```tsx id="rhdg1g"
// @zeus-ui/react/zw-button.tsx

import * as React from 'react'

export interface ZwButtonProps extends React.HTMLAttributes<HTMLElement> {
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'primary' | 'danger'
  onPress?: (event: CustomEvent<void>) => void
}

export const ZwButton = React.forwardRef<HTMLElement, ZwButtonProps>(
  function ZwButton(props, ref) {
    return React.createElement('zw-button', {
      ...props,
      ref,
    })
  },
)
```

这里先不做 event bridge。
如果 React 对 `onPress` 自定义事件支持不稳定，后续用 `wrapper: "event-bridge"` 单独增强。

---

## 7.3 `index.ts`

```ts id="u5ui5c"
// @zeus-ui/react/index.ts

export { setupZeusUI } from './setup.js'
export { ZwButton } from './zw-button.js'
export type { ZwButtonProps } from './zw-button.js'
```

React 用户：

```tsx id="pf3nmu"
import { setupZeusUI, ZwButton } from '@zeus-ui/react'

setupZeusUI()

export function App() {
  return (
    <ZwButton size="md" variant="primary">
      Submit
    </ZwButton>
  )
}
```

或者不用 wrapper：

```tsx id="zc1sti"
import { setupZeusUI } from '@zeus-ui/react'

setupZeusUI()

export function App() {
  return (
    <zw-button size="md" variant="primary">
      Submit
    </zw-button>
  )
}
```

---

# 8. 类型生成

## 8.1 DOM 类型

```ts id="k73aog"
// @zeus-ui/web-c/types/dom.d.ts

export interface ZwButtonElement extends HTMLElement {
  disabled: boolean
  size: 'sm' | 'md' | 'lg'
  variant: 'default' | 'primary' | 'danger'
}

declare global {
  interface HTMLElementTagNameMap {
    'zw-button': ZwButtonElement
  }
}

export {}
```

---

## 8.2 JSX 类型

```ts id="w0f91y"
// @zeus-ui/web-c/types/jsx.d.ts

import type * as React from 'react'

export interface ZwButtonJSXProps extends React.HTMLAttributes<HTMLElement> {
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'primary' | 'danger'
  onPress?: (event: CustomEvent<void>) => void
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'zw-button': ZwButtonJSXProps
    }
  }
}

export {}
```

---

## 8.3 Vue 类型

```ts id="yepqzj"
// @zeus-ui/web-c/types/vue.d.ts

import type { DefineComponent } from 'vue'

export interface ZwButtonProps {
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'primary' | 'danger'
}

declare module 'vue' {
  export interface GlobalComponents {
    ZwButton: DefineComponent<ZwButtonProps>
  }
}

export {}
```

---

# 9. 组件库 `package.json` exports 设计

```json id="ajck20"
{
  "name": "@zeus-ui/web-c",
  "type": "module",
  "sideEffects": ["./auto.js"],
  "exports": {
    ".": {
      "types": "./types/dom.d.ts",
      "import": "./loader.js"
    },
    "./loader": {
      "types": "./loader.d.ts",
      "import": "./loader.js"
    },
    "./auto": {
      "import": "./auto.js"
    },
    "./types/dom": {
      "types": "./types/dom.d.ts"
    },
    "./types/jsx": {
      "types": "./types/jsx.d.ts"
    },
    "./types/vue": {
      "types": "./types/vue.d.ts"
    }
  }
}
```

注意：

```json id="p7nio6"
"sideEffects": [
  "./auto.js"
]
```

因为 `auto.js` 是副作用入口，不能被 tree-shaking 掉。

---

# 10. Vue Vite 配置

如果 Vue 模板里直接写 `<zw-button>`，需要告诉 Vue 这是 custom element：

```ts id="ot4vbr"
// vite.config.ts

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: tag => tag.startsWith('zw-'),
        },
      },
    }),
  ],
})
```

否则 Vue 可能把它当 Vue 组件解析。

---

# 11. 编译器生成器草案

Zeus compiler / builder 最终要生成：

```txt id="o9jes3"
loader.ts
auto.ts
components.manifest.ts
*.entry.ts
vue wrappers
react wrappers
types
```

核心生成器可以这样组织：

```ts id="j7r2r1"
// packages/web-c-output/src/generateWebCOutput.ts

import { resolveWebCCompileOptions, type WebCCompileOptions } from './options'

export interface ComponentMeta {
  tagName: string
  exportName: string
  shadow?: boolean
  props: Array<{
    name: string
    attrName?: string
    type: string
    reflect?: boolean
    default?: unknown
    tsType?: string
  }>
  events: Array<{
    name: string
    tsType?: string
  }>
  slots: Array<{
    name: string
  }>
}

export interface GeneratedFile {
  path: string
  code: string
}

export function generateWebCOutput(
  components: ComponentMeta[],
  options: WebCCompileOptions = {},
): GeneratedFile[] {
  const resolved = resolveWebCCompileOptions(options)
  const files: GeneratedFile[] = []

  if (resolved.register === 'lazy') {
    files.push(generateManifest(components))
    files.push(generateLoader())
  }

  if (resolved.autoEntry) {
    files.push(generateAutoEntry())
  }

  for (const component of components) {
    files.push(generateComponentEntry(component))
  }

  if (resolved.wrapper === 'minimal') {
    files.push(...components.map(generateVueWrapper))
    files.push(...components.map(generateReactWrapper))
  }

  if (resolved.types) {
    files.push(generateDomTypes(components))
    files.push(generateJsxTypes(components))
    files.push(generateVueTypes(components))
  }

  return files
}
```

---

## 11.1 `generateManifest`

```ts id="jx23ym"
function generateManifest(components: ComponentMeta[]): GeneratedFile {
  const items = components.map(component => {
    return `  {
    tagName: ${JSON.stringify(component.tagName)},
    shadow: ${component.shadow ? 'true' : 'false'},
    load: () => import(${JSON.stringify(`./${component.tagName}.entry.js`)}),
    props: ${JSON.stringify(component.props, null, 4)},
    events: ${JSON.stringify(component.events, null, 4)},
    slots: ${JSON.stringify(component.slots, null, 4)},
  }`
  })

  return {
    path: 'components.manifest.ts',
    code: `import type { ZeusLazyComponentMeta } from "@zeus-js/web-c-runtime";

export const components: ZeusLazyComponentMeta[] = [
${items.join(',\n')}
];
`,
  }
}
```

---

## 11.2 `generateLoader`

```ts id="owewjx"
function generateLoader(): GeneratedFile {
  return {
    path: 'loader.ts',
    code: `import { bootstrapLazy } from "@zeus-js/web-c-runtime";
import { components } from "./components.manifest.js";

const ZEUS_DEFINE_KEY = Symbol.for("zeus.web-c.defined");

interface DefineState {
  defined?: boolean;
}

function getDefineState(): DefineState {
  const globalObject = globalThis as typeof globalThis & {
    [ZEUS_DEFINE_KEY]?: DefineState;
  };

  globalObject[ZEUS_DEFINE_KEY] ??= {};

  return globalObject[ZEUS_DEFINE_KEY];
}

export interface DefineCustomElementsOptions {
  registry?: CustomElementRegistry;
}

export function defineCustomElements(
  options: DefineCustomElementsOptions = {},
): void {
  const state = getDefineState();

  if (state.defined) {
    return;
  }

  state.defined = true;

  bootstrapLazy(components, {
    registry: options.registry ?? customElements,
  });
}

export const defineLazyElements = defineCustomElements;
`,
  }
}
```

---

## 11.3 `generateAutoEntry`

```ts id="b8m9cf"
function generateAutoEntry(): GeneratedFile {
  return {
    path: 'auto.ts',
    code: `import { defineCustomElements } from "./loader.js";

defineCustomElements();

export {};
`,
  }
}
```

---

## 11.4 `generateVueWrapper`

```ts id="e5b1au"
function generateVueWrapper(component: ComponentMeta): GeneratedFile {
  const props = component.props.map(prop => {
    return `    ${JSON.stringify(prop.name)}: ${toVueRuntimeType(prop.type)}`
  })

  return {
    path: `vue/${component.tagName}.ts`,
    code: `import { defineComponent, h } from "vue";

export const ${component.exportName} = defineComponent({
  name: ${JSON.stringify(component.exportName)},
  inheritAttrs: false,
  props: {
${props.join(',\n')}
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        ${JSON.stringify(component.tagName)},
        {
          ...attrs,
          ...props,
        },
        slots.default?.(),
      );
  },
});
`,
  }
}

function toVueRuntimeType(type: string): string {
  switch (type) {
    case 'boolean':
      return 'Boolean'
    case 'number':
      return 'Number'
    case 'string':
      return 'String'
    case 'array':
      return 'Array'
    case 'object':
      return 'Object'
    case 'function':
      return 'Function'
    default:
      return 'null'
  }
}
```

---

## 11.5 `generateReactWrapper`

```ts id="zhku0f"
function generateReactWrapper(component: ComponentMeta): GeneratedFile {
  const propLines = component.props.map(prop => {
    const tsType = prop.tsType ?? toTsType(prop.type)
    return `  ${prop.name}?: ${tsType};`
  })

  return {
    path: `react/${component.tagName}.tsx`,
    code: `import * as React from "react";

export interface ${component.exportName}Props
  extends React.HTMLAttributes<HTMLElement> {
${propLines.join('\n')}
}

export const ${component.exportName} = React.forwardRef<
  HTMLElement,
  ${component.exportName}Props
>(function ${component.exportName}(props, ref) {
  return React.createElement(${JSON.stringify(component.tagName)}, {
    ...props,
    ref,
  });
});
`,
  }
}

function toTsType(type: string): string {
  switch (type) {
    case 'boolean':
      return 'boolean'
    case 'number':
      return 'number'
    case 'string':
      return 'string'
    case 'array':
      return 'unknown[]'
    case 'object':
      return 'Record<string, unknown>'
    case 'function':
      return '(...args: unknown[]) => unknown'
    default:
      return 'unknown'
  }
}
```

---

# 12. 测试要点

## 12.1 `defineCustomElements` 只注册 proxy，不加载 entry

```ts id="rw9sw9"
import { describe, expect, it, vi } from 'vitest'
import { bootstrapLazy } from '@zeus-js/web-c-runtime'

describe('bootstrapLazy', () => {
  it('defines lazy proxy elements without loading entries', () => {
    const load = vi.fn()

    bootstrapLazy([
      {
        tagName: 'zw-test',
        shadow: true,
        load,
        props: [],
      },
    ])

    expect(customElements.get('zw-test')).toBeTruthy()
    expect(load).not.toHaveBeenCalled()
  })
})
```

---

## 12.2 元素 connected 后才加载

```ts id="ne7xcv"
import { describe, expect, it, vi } from 'vitest'
import { bootstrapLazy } from '@zeus-js/web-c-runtime'

describe('lazy element', () => {
  it('loads component module when connected', async () => {
    const load = vi.fn().mockResolvedValue({
      createComponent() {
        return {
          connected: vi.fn(),
          render: vi.fn(),
        }
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-lazy-load-test',
        shadow: true,
        load,
        props: [],
      },
    ])

    const el = document.createElement('zw-lazy-load-test')
    document.body.appendChild(el)

    await Promise.resolve()
    await Promise.resolve()

    expect(load).toHaveBeenCalledTimes(1)
  })
})
```

---

## 12.3 多个相同组件只加载一次

```ts id="w6s6xa"
it('dedupes component module loading', async () => {
  const load = vi.fn().mockResolvedValue({
    createComponent() {
      return {
        render() {
          return document.createTextNode('ok')
        },
      }
    },
  })

  bootstrapLazy([
    {
      tagName: 'zw-dedupe-test',
      shadow: false,
      load,
      props: [],
    },
  ])

  document.body.appendChild(document.createElement('zw-dedupe-test'))
  document.body.appendChild(document.createElement('zw-dedupe-test'))

  await Promise.resolve()
  await Promise.resolve()

  expect(load).toHaveBeenCalledTimes(1)
})
```

---

## 12.4 属性在真实组件加载前不丢

```ts id="y3f8pl"
it('preserves properties assigned before module is loaded', async () => {
  let receivedValue: unknown

  const load = vi.fn().mockResolvedValue({
    createComponent(hostRef) {
      return {
        connected() {
          receivedValue = (hostRef.host as any).columns
        },
      }
    },
  })

  bootstrapLazy([
    {
      tagName: 'zw-table-test',
      shadow: false,
      load,
      props: [
        {
          name: 'columns',
          type: 'array',
        },
      ],
    },
  ])

  const el = document.createElement('zw-table-test') as any
  el.columns = [{ key: 'name' }]

  document.body.appendChild(el)

  await Promise.resolve()
  await Promise.resolve()

  expect(receivedValue).toEqual([{ key: 'name' }])
})
```

---

# 13. 最终落地阶段

```txt id="h0od92"
Phase 0
  新增 @zeus-js/web-c-runtime
  实现 bootstrapLazy / HostRef / ProxyElement / prop bridge

Phase 1
  改 Web-C 编译输出
  生成 components.manifest.ts / loader.ts / auto.ts / *.entry.ts

Phase 2
  改 Vue wrapper
  删除 watch / syncProps / event bridge
  只保留 h("zw-*")

Phase 3
  改 React wrapper
  默认 minimal
  后续 event-bridge 单独作为增强模式

Phase 4
  types 默认生成
  DOM / JSX / Vue / React 全覆盖

Phase 5
  示例
  Vue 直接写 <zw-button>
  React 直接写 <zw-button>
  原生 HTML 直接写 <zw-button>
  wrapper 使用 <ZwButton>
```

---

# 14. 最终一句话

Zeus Web-C 应该最终长这样：

```txt id="a9rwb4"
组件库提供：
  @zeus-ui/web-c/loader
  @zeus-ui/web-c/auto
  @zeus-ui/web-c/components.manifest
  @zeus-ui/web-c/*.entry

Zeus runtime 提供：
  bootstrapLazy
  Proxy custom element
  HostRef
  prop/attr/lifecycle bridge

懒加载机制：
  auto/loader 只注册轻量 ProxyClass
  <zw-button> connected 时才 import 真实 entry chunk

Vue/React wrapper：
  默认极简，只渲染 zw-* 标签，不托管生命周期
```

这版是目前最稳的设计：**既能在 Vue 中直接写 `<zw-button>`，又不需要 Vue wrapper；既能保持 Stencil-style 懒加载，又能让 API 属于组件库产物，而不是 Zeus 核心 runtime。**
