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

当前实现修订：

```txt
1. WebCRegisterMode 只保留 lazy / side-effect；manual 暂不进入当前里程碑，避免扩大输出模式。
2. shadow 默认值与 defineElement 保持一致：false。manifest 必须显式写出 true 才进入 Shadow DOM。
3. lazy manifest 只描述 runtime props；events / slots 留给类型、文档和 custom-elements manifest，不进入 lazy runtime meta。
4. lazy runtime 不再维护 attributeChanged 队列；attribute 变化统一降级为 propertyChanged，与 mountElementDefinition 的 prop store 对齐。
5. defineCustomElements(options) 和 bootstrapLazy(options) 都支持自定义 registry，便于测试、多 registry 环境与非默认 customElements。
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
  loader.d.ts
  index.js
  index.d.ts
  auto.js
  components.manifest.js
  zw-button.entry.js
  zw-input.entry.js
  types/
    jsx.d.ts

@zeus-ui/vue/
  index.js
  index.d.ts
  global.d.ts
  zw-button.js

@zeus-ui/react/
  index.js
  index.d.ts
  zw-button.js
```

---

# 3. 编译配置最终版

```ts id="q1dxkq"
// packages/web-c/output-wc/src/types.ts

export type WebCRegisterMode = 'lazy' | 'side-effect'

export interface OutputWCOptions {
  /**
   * lazy:
   *   默认值。生成 Stencil-style lazy loader。
   *   启动时注册轻量 ProxyClass，connected 时加载真实组件 entry。
   *
   * side-effect:
   *   import 后立即注册完整组件，适合需要 eager registration 的场景。
   */
  register?: WebCRegisterMode

  /**
   * 是否生成组件库 auto.js 入口。
   *
   * @default true
   */
  auto?: boolean

  /**
   * 是否生成 Web Component d.ts。
   *
   * @default true
   */
  dts?: boolean | 'auto'

  /**
   * 是否生成 JSX IntrinsicElements d.ts。
   *
   * @default true
   */
  jsxDts?: boolean | 'auto'
}
```

Vue / React wrapper 的模式由各自 wrapper 插件和 preset 控制：

```ts
export type WebCWrapperMode = 'minimal' | 'event-bridge'

export interface ComponentLibraryPresetOptions {
  targets?: Array<'wc' | 'react' | 'vue'>
  register?: WebCRegisterMode
  wrapper?: WebCWrapperMode
  autoEntry?: boolean
  dts?: boolean | 'auto'
  jsxDts?: boolean | 'auto'
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
  attrName?: string | false
  type: ZeusPropType
  reflect?: boolean
  default?: unknown
}

export interface ZeusLazyComponentMeta {
  tagName: string

  /**
   * 真实组件实现 chunk。
   * 这个函数必须由组件库 manifest 显式生成，避免 runtime 拼动态路径。
   */
  load: () => Promise<ZeusComponentModule | { default: ZeusComponentModule }>

  props: ZeusPropMeta[]

  /**
   * 是否渲染到 ShadowRoot。
   *
   * @default false
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

  reflectingAttrs: Set<string>

  readyWaiters: Array<{
    resolve(host: HTMLElement): void
    reject(error: unknown): void
  }>
}

export interface ZeusComponentInstance {
  connected?(): void
  disconnected?(): void

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
    reflectingAttrs: new Set(),
    readyWaiters: [],
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
  _oldValue: string | null,
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

import { applyInitialValues } from './props'
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
  ZeusLazyComponentMeta,
  ZeusPropMeta,
  ZeusPropType,
} from './types'
```

---

# 5. 组件库生成产物：`@zeus-ui/web-c`

下面这些不是 Zeus runtime 写死的，而是 Zeus compiler 给组件库生成出来的。

---

## 5.1 `components.manifest.js`

```ts id="d7yusd"
// @zeus-ui/web-c/components.manifest.js

export const components = [
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
      },
      {
        name: 'size',
        attrName: 'size',
        type: 'string',
        reflect: true,
      },
      {
        name: 'variant',
        attrName: 'variant',
        type: 'string',
        reflect: true,
      },
    ],
  },
]
```

---

## 5.2 `loader.js`

```ts id="f8pj68"
// @zeus-ui/web-c/loader.js

import { bootstrapLazy } from '@zeus-js/web-c-runtime'
import { components } from './components.manifest.js'

const definedRegistries = new WeakSet<CustomElementRegistry>()

export interface DefineCustomElementsOptions {
  registry?: CustomElementRegistry
}

export function defineCustomElements(
  options: DefineCustomElementsOptions = {},
): void {
  const registry =
    options.registry ??
    (typeof customElements === 'undefined' ? undefined : customElements)

  if (!registry || definedRegistries.has(registry)) {
    return
  }

  bootstrapLazy(components, { registry })

  definedRegistries.add(registry)
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

## 5.3 `auto.js`

```ts id="yp9hy8"
// @zeus-ui/web-c/auto.js

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

## 5.4 `zw-button.entry.js`

lazy entry 是编译器生成的真实组件实现 chunk。它不手写组件 class，也不执行 `customElements.define()`；它只把源组件的 `defineElement(...)` 定义挂载到已经存在的 lazy host 上。

当前生成结构概念上等价于：

```ts id="kkd43o"
// @zeus-ui/web-c/zw-button.entry.js

import { mountElementDefinition } from '@zeus-js/runtime-dom'
import { ZwButton } from '../src/button.js'

export function createComponent(hostRef) {
  let mounted
  const mountState = {}

  return {
    connected() {
      if (mounted) return

      mounted = mountElementDefinition(
        ZwButton,
        hostRef.host,
        hostRef.values,
        mountState,
      )
    },

    disconnected() {
      mounted?.dispose()
      mounted = undefined
    },

    propertyChanged(name, oldValue, newValue) {
      mounted?.propertyChanged(name, oldValue, newValue)
    },
  }
}

export default { createComponent }
```

重点：

```txt id="e246o1"
1. 真实 entry 不注册 custom element。
2. 真实 entry 通过 mountElementDefinition 复用 runtime-dom 的 owner / cleanup / Host / Slot 语义。
3. 属性变化只通过 propertyChanged 进入真实组件 prop store。
```

---

# 6. Vue wrapper 输出：`@zeus-ui/vue`

Vue wrapper 是可选产物。当前实现不生成 Vue plugin；wrapper 文件自己导入对应的 `zeus:wc:<tag>` 兼容模块。这个兼容模块只调用 `defineCustomElements()` 注册 lazy proxy，不加载真实 entry。

如果用户直接写 `<zw-button>`，需要应用入口导入 `@zeus-ui/web-c/auto`，或手动调用 Web-C loader。

---

## 6.1 minimal wrapper

```ts id="wjk2d9"
// @zeus-ui/vue/zw-button.ts

import { defineComponent, h } from 'vue'

import 'zeus:wc:zw-button'

export const ZwButton = defineComponent({
  name: 'ZwButton',
  inheritAttrs: false,

  setup(_props, { attrs, slots }) {
    return () =>
      h(
        'zw-button',
        {
          ...attrs,
        },
        slots.default?.(),
      )
  },
})
```

minimal 模式没有：

```txt id="zor23w"
props runtime option
watch
syncProps
ref
onMounted
onBeforeUnmount
addEventListener
removeEventListener
```

具名 slot 需要 wrapper 帮忙给 VNode 补 `slot` attribute；这个场景可以使用 `cloneVNode`，但仍不做生命周期托管。

---

## 6.2 event-bridge wrapper

`event-bridge` 是增强模式，用于显式同步用户传入的 props、桥接 CustomEvent。它必须满足：

```txt
1. 只同步用户显式传入的 props。
2. 不复制 Web Component default 到 Vue prop option。
3. 当用户移除 prop 输入时，将 element[prop] 写回 undefined。
4. 事件监听在 mounted 建立，在 beforeUnmount 清理。
```

---

## 6.3 Vue 使用方式

### 原生 custom element 标签

```vue id="uil0oe"
<template>
  <zw-button size="md">Submit</zw-button>
</template>
```

入口：

```ts id="fcvk3a"
import '@zeus-ui/web-c/auto'
```

### Vue wrapper

```vue id="xiqorh"
<template>
  <ZwButton size="md">Submit</ZwButton>
</template>
```

底层还是渲染成 `<zw-button>`。

---

# 7. React wrapper 输出：`@zeus-ui/react`

React wrapper 是可选产物。当前实现不生成独立的 `setup.ts`；wrapper 文件自己导入对应的 `zeus:wc:<tag>` 兼容模块。

---

## 7.1 minimal wrapper

```tsx id="rhdg1g"
// @zeus-ui/react/zw-button.tsx

import * as React from 'react'

import 'zeus:wc:zw-button'

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

这里先不做 event bridge。需要稳定桥接 CustomEvent 时，使用 `wrapper: "event-bridge"` 增强模式。

---

## 7.2 event-bridge wrapper

`event-bridge` 模式会：

```txt
1. 用 ref 持有真实 custom element。
2. 用 effect 把显式传入的 props 写到 element property。
3. 用 addEventListener / removeEventListener 桥接 CustomEvent。
4. 支持命名 slot children 转成带 slot attribute 的节点。
```

---

## 7.3 `index.ts`

```ts id="u5ui5c"
// @zeus-ui/react/index.ts

export { ZwButton } from './zw-button.js'
export type { ZwButtonProps } from './zw-button.js'
```

React 用户：

```tsx id="pf3nmu"
import { ZwButton } from '@zeus-ui/react'

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
import '@zeus-ui/web-c/auto'

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

类型按输出包拆分，而不是全部挂在 Web-C 包下面。

## 8.1 Web-C loader / element 类型

lazy 模式下 `@zeus-js/output-wc` 生成 `loader.d.ts`，同时 `index.d.ts` 复用 loader 声明：

```ts id="k73aog"
export interface ZwButtonElement extends HTMLElement {
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'primary' | 'danger'
  componentOnReady(): Promise<this>
}

export interface DefineCustomElementsOptions {
  registry?: CustomElementRegistry
}

export declare function defineCustomElements(
  options?: DefineCustomElementsOptions,
): void

export declare const defineLazyElements: typeof defineCustomElements

declare global {
  interface HTMLElementTagNameMap {
    'zw-button': ZwButtonElement
  }
}

export {}
```

---

## 8.2 JSX 类型

Web-C 包生成 `types/jsx.d.ts`，用于直接写 `<zw-button>`：

```ts id="w0f91y"
export interface ZwButtonJSXProps {
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

## 8.3 Vue / React wrapper 类型

Vue 和 React 类型由各自 wrapper output 生成：

```txt
@zeus-ui/vue/index.d.ts
@zeus-ui/vue/global.d.ts
@zeus-ui/react/index.d.ts
```

这些文件描述 PascalCase wrapper 组件；它们不属于 Web-C lazy runtime manifest。

---

# 9. 组件库 `package.json` exports 设计

Web-C 包：

```json id="ajck20"
{
  "name": "@zeus-ui/web-c",
  "type": "module",
  "sideEffects": ["./auto.js"],
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    },
    "./loader": {
      "types": "./loader.d.ts",
      "import": "./loader.js"
    },
    "./auto": {
      "import": "./auto.js"
    },
    "./types/jsx": {
      "types": "./types/jsx.d.ts"
    }
  }
}
```

Vue / React wrapper 包各自导出自己的 `index.js` / `index.d.ts`。`auto.js` 是副作用入口，必须通过 `sideEffects` 保留，不能被 tree-shaking 掉。

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

Zeus compiler / builder 当前要生成：

```txt id="o9jes3"
loader.js
loader.d.ts
auto.js
components.manifest.js
*.entry.js
Vue wrappers
React wrappers
WC / JSX / Vue / React types
```

核心生成器按职责拆在多个 output plugin 中，而不是一个单体 `generateWebCOutput()`：

```txt
@zeus-js/output-wc
  register: lazy / side-effect
  manifest / loader / auto / lazy entry / WC dts / JSX dts

@zeus-js/output-vue-wrapper
  minimal / event-bridge Vue wrapper
  Vue dts / global dts

@zeus-js/output-react-wrapper
  minimal / event-bridge React wrapper
  React dts

@zeus-js/web-c
  组合 wc / vue / react / css 输出
  当 targets 包含 react 或 vue 时自动补 wc
```

---

## 11.1 `generateLazyManifest`

lazy manifest 只包含 lazy runtime 注册 proxy 所需的信息。公共 props、events、slots 仍可用于类型、文档和 custom-elements manifest，但不进入 lazy runtime manifest。

```ts id="jx23ym"
function generateLazyManifest(components: ComponentRecord[]): string {
  const items = components.map(component => {
    const props = component.runtimeProps ?? component.props

    return `  {
    tagName: ${JSON.stringify(component.tag)},
    shadow: ${component.meta?.shadow ?? false},
    load: () => import(${JSON.stringify(`./${component.tag}.entry.js`)}),
    props: ${generatePropsArray(props)},
  }`
  })

  return `export const components = [
${items.join(',\n')}
];
`
}
```

规则：

```txt
1. props 必须优先使用 runtimeProps。
2. attrName: false 表示 property-only，不注册 observed attribute。
3. default 不写入 lazy manifest；真实默认值由 mountElementDefinition 中的 defineElement 定义提供。
4. events / slots 不写入 lazy manifest。
```

---

## 11.2 `generateLoader`

```ts id="owewjx"
function generateLoader(): string {
  return `import { bootstrapLazy } from "@zeus-js/web-c-runtime";
import { components } from "./components.manifest.js";

const definedRegistries = new WeakSet();

export function defineCustomElements(options = {}) {
  const registry =
    options.registry ??
    (typeof customElements === "undefined" ? undefined : customElements);

  if (!registry || definedRegistries.has(registry)) {
    return;
  }

  bootstrapLazy(components, { registry });

  definedRegistries.add(registry);
}

export const defineLazyElements = defineCustomElements;
`
}
```

---

## 11.3 `generateAutoEntry`

```ts id="b8m9cf"
function generateAutoEntry(): string {
  return `import { defineCustomElements } from "./loader.js";

defineCustomElements();

export {};
`
}
```

---

## 11.4 `generateLazyEntry`

```ts id="entrygen"
function generateLazyEntry(component: ComponentRecord): string {
  return `import { mountElementDefinition } from "@zeus-js/runtime-dom";
import { ${component.exportName} } from ${JSON.stringify(component.source)};

export function createComponent(hostRef) {
  let mounted;
  const mountState = {};

  return {
    connected() {
      if (mounted) return;

      mounted = mountElementDefinition(
        ${component.exportName},
        hostRef.host,
        hostRef.values,
        mountState,
      );
    },

    disconnected() {
      mounted?.dispose();
      mounted = undefined;
    },

    propertyChanged(name, oldValue, newValue) {
      mounted?.propertyChanged(name, oldValue, newValue);
    },
  };
}

export default { createComponent };
`
}
```

---

## 11.5 `generateVueWrapper`

minimal wrapper 只渲染 custom element 标签并导入 WC 兼容模块：

```ts id="e5b1au"
function generateVueWrapper(component: ComponentRecord): string {
  return `import { defineComponent, h } from "vue";

import "zeus:wc:${component.tag}";

export const ${component.name} = defineComponent({
  name: ${JSON.stringify(component.name)},
  inheritAttrs: false,

  setup(_props, { attrs, slots }) {
    return () => h(${JSON.stringify(component.tag)}, { ...attrs }, slots.default?.());
  },
});
`
}
```

`event-bridge` wrapper 另走增强生成逻辑：声明 Vue props 但不复制 Web Component default，并只同步用户显式传入的 prop。

---

## 11.6 `generateReactWrapper`

minimal wrapper 只渲染 custom element 标签并导入 WC 兼容模块：

```ts id="zhku0f"
function generateReactWrapper(component: ComponentRecord): string {
  return `import * as React from "react";

import "zeus:wc:${component.tag}";

export const ${component.name} = React.forwardRef(function ${component.name}(props, ref) {
  return React.createElement(${JSON.stringify(component.tag)}, {
    ...props,
    ref,
  });
});
`
}
```

`event-bridge` wrapper 另走增强生成逻辑：通过 ref + effect 同步 props，并用原生 addEventListener 桥接 CustomEvent。

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
  生成 components.manifest.js / loader.js / auto.js / *.entry.js

Phase 2
  改 Vue wrapper
  默认 minimal，只渲染 h("zw-*")
  event-bridge 作为显式增强模式

Phase 3
  改 React wrapper
  默认 minimal
  event-bridge 作为显式增强模式

Phase 4
  types 默认生成
  Web-C loader / JSX / Vue / React 全覆盖

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
