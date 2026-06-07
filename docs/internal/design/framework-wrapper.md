可以。基于 `stenciljs/output-targets` 的源码看，Zeus 这块应该按 **“output target 生成薄代理，framework runtime 负责桥接”** 来设计，而不是继续在每个 wrapper 里生成完整逻辑。

Stencil 的仓库本身就是一个 monorepo，React/Vue/Angular/types 都是独立 output target，根脚本也分别有 `build.react`、`build.vue`、`test.unit.react`、`test.unit.vue` 等入口。

React 侧更关键：Stencil 的 React runtime 直接基于 `@lit/react` 的 `createComponent`，自己的 `createComponent` 只做 `defineCustomElement()`、`transformTag`，然后委托给 `@lit/react`。
Vue 侧则是自己实现 `defineContainer(...)`，内部处理 props 默认占位、emits、`v-model`、事件监听、class 同步等。

---

# 1. Zeus 最终架构

```txt id="ux0ojx"
packages/web-c/
  web-c-runtime/
    bootstrapLazy / lazy-element / HostRef

  output-wc/
    生成 wc/loader.js
    生成 wc/auto.js
    生成 wc/components.manifest.js
    生成 wc/*.entry.js

  output-react-wrapper/
    @zeus-js/output-react-wrapper
    @zeus-js/output-react-wrapper/runtime
      createComponent()
      内部基于 @lit/react

  output-vue-wrapper/
    @zeus-js/output-vue-wrapper
    @zeus-js/output-vue-wrapper/runtime
      defineContainer()
      自己实现 Vue bridge

    只生成 React 代理文件
    不再生成 useEffect/addEventListener/syncProps 逻辑

    只生成 Vue 代理文件
    不再生成 onMounted/addEventListener/syncProps 逻辑
```

Zeus 当前的问题是 React wrapper 每个组件会 `import "zeus:wc:<tag>"`，Vue wrapper 也是每个组件 import `wcModuleId`。而 `output-wc` 又给每个 `zeus:wc:<tag>` 生成了一个调用 `defineCustomElements()` 的桥接模块，也就是每个 wrapper 都在触发“注册全部组件”的副作用。

新的分层应该是：

```txt id="yphx2m"
wrapper 文件：
  只声明 tagName / props / events / slots / model / defineCustomElement

runtime helper：
  React: createComponent()
  Vue: defineContainer()

wc loader：
  defineCustomElement(tagName)
  defineCustomElements()
```

---

# 2. `output-wc`：补齐单组件注册 API

Stencil Vue output target 支持两种注册路径：一种是 import 单个 custom element 的 `defineCustomElement`，另一种是 loader 级 `defineCustomElements()`。源码里 `includeImportCustomElements` 时会逐组件 import `defineCustomElement as defineXxx`，否则可以从 loader import `defineCustomElements()`。

Zeus lazy 模式没有 “每组件真实 custom element class”，因为真实组件在 `*.entry.js`，所以要在 `wc/loader.js` 里提供：

```ts id="ax4zab"
defineCustomElement(tagName)
defineCustomElements()
```

### 修改 `packages/web-c/output-wc/src/generateLoader.ts`

```ts id="yqvf7p"
export function generateLoader(): string {
  return `import { bootstrapLazy } from "@zeus-js/web-c-runtime";
import { components } from "./components.manifest.js";

const componentsByTagName = new Map(
  components.map(component => [component.tagName, component]),
);

const definedTagsByRegistry = new WeakMap();

function resolveRegistry(options) {
  return options.registry ??
    (typeof customElements === "undefined" ? undefined : customElements);
}

function getDefinedTags(registry) {
  let definedTags = definedTagsByRegistry.get(registry);

  if (!definedTags) {
    definedTags = new Set();
    definedTagsByRegistry.set(registry, definedTags);
  }

  return definedTags;
}

export function defineCustomElement(tagName, options = {}) {
  const registry = resolveRegistry(options);

  if (!registry) {
    return;
  }

  const component = componentsByTagName.get(tagName);

  if (!component) {
    throw new Error(\`[zeus:web-c] Unknown custom element: <\${tagName}>.\`);
  }

  const definedTags = getDefinedTags(registry);

  if (definedTags.has(tagName) || registry.get(tagName)) {
    definedTags.add(tagName);
    return;
  }

  bootstrapLazy([component], { registry });

  definedTags.add(tagName);
}

export function defineCustomElements(options = {}) {
  for (const component of components) {
    defineCustomElement(component.tagName, options);
  }
}

export const defineLazyElement = defineCustomElement;
export const defineLazyElements = defineCustomElements;
`
}

export function generateAutoEntry(): string {
  return `import { defineCustomElements } from "./loader.js";

defineCustomElements();

export {};
`
}

export function generateLazyIndex(): string {
  return `export {
  defineCustomElement,
  defineCustomElements,
  defineLazyElement,
  defineLazyElements,
} from "./loader.js";
`
}
```

### 修改 `packages/web-c/web-c-runtime/src/bootstrapLazy.ts`

```ts id="oc9krq"
import { createLazyElementClass } from './lazy-element'

import type { ZeusLazyComponentMeta } from './types'

export interface BootstrapLazyOptions {
  registry?: CustomElementRegistry
}

export function bootstrapLazy(
  components: ZeusLazyComponentMeta[],
  options: BootstrapLazyOptions = {},
): void {
  const registry =
    options.registry ??
    (typeof customElements === 'undefined' ? undefined : customElements)

  if (!registry) {
    return
  }

  for (const meta of components) {
    if (registry.get(meta.tagName)) {
      continue
    }

    registry.define(meta.tagName, createLazyElementClass(meta))
  }
}
```

---

# 3. `@zeus-js/react-wrapper`：直接参考 Stencil React

Stencil React runtime 的核心很薄：调用 `defineCustomElement()`，然后把 `tagName/events/react` 等交给 `@lit/react`。
Zeus 也应该这样做，不要自己维护 React 事件/属性同步逻辑。

### `packages/web-c/output-react-wrapper/src/runtime/createComponent.ts`

```ts id="1j879a"
import type * as ReactTypes from 'react'
import {
  createComponent as createLitComponent,
  type EventName,
  type Options,
} from '@lit/react'

type EventNames = Record<string, EventName | string>

export type ZeusReactComponent<
  I extends HTMLElement,
  E extends EventNames = {},
  C = Omit<I, keyof HTMLElement>,
> = ReactTypes.FunctionComponent<
  Omit<ReactTypes.HTMLAttributes<I>, keyof E> &
    Partial<{
      [K in keyof E]: E[K] extends EventName<infer T>
        ? (event: T) => void
        : (event: Event) => void
    }> &
    Partial<C> &
    ReactTypes.RefAttributes<I>
>

export interface ZeusReactCreateComponentOptions<
  I extends HTMLElement,
  E extends EventNames,
> extends Omit<Options<I, E>, 'elementClass'> {
  react: typeof ReactTypes
  defineCustomElement?: () => void
  elementClass?: CustomElementConstructor
  transformTag?: (tagName: string) => string
}

export function createComponent<
  I extends HTMLElement,
  E extends EventNames = {},
  C = Omit<I, keyof HTMLElement>,
>(options: ZeusReactCreateComponentOptions<I, E>): ZeusReactComponent<I, E, C> {
  const { defineCustomElement, tagName, transformTag, elementClass, ...rest } =
    options

  defineCustomElement?.()

  const finalTagName = transformTag ? transformTag(tagName) : tagName
  const resolvedElementClass =
    elementClass ??
    (typeof customElements === 'undefined'
      ? HTMLElement
      : (customElements.get(finalTagName) ?? HTMLElement))

  return createLitComponent<I, E>({
    ...rest,
    tagName: finalTagName,
    elementClass: resolvedElementClass as CustomElementConstructor,
  }) as unknown as ZeusReactComponent<I, E, C>
}
```

### `packages/web-c/output-react-wrapper/src/runtime/index.ts`

```ts id="b59cl0"
export { createComponent }
export type {
  ZeusReactComponent,
  ZeusReactCreateComponentOptions,
} from './createComponent'
```

### `packages/web-c/output-react-wrapper/package.json`

```json id="52u8bb"
{
  "name": "@zeus-js/react-wrapper",
  "version": "0.1.0-beta.4",
  "description": "Zeus React wrapper runtime",
  "type": "module",
  "main": "index.js",
  "module": "dist/react-wrapper.esm-bundler.js",
  "types": "dist/react-wrapper.d.ts",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/react-wrapper.d.ts",
      "import": "./dist/react-wrapper.esm-bundler.js",
      "require": "./index.js"
    }
  },
  "sideEffects": false,
  "dependencies": {
    "@lit/react": "^1.0.0"
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    }
  }
}
```

---

# 4. `output-react-wrapper`：只生成代理

Stencil React generator 会导入组件的 `defineCustomElement` 和 element class，然后生成 `createComponent({ tagName, elementClass, react, events, defineCustomElement })`。

Zeus 生成结果应变成：

```tsx id="95749i"
import React from 'react'
import { createComponent } from '@zeus-js/output-react-wrapper/runtime'
import { defineCustomElement } from '../wc/loader.js'

export const ZButton = createComponent({
  tagName: 'z-button',
  react: React,
  defineCustomElement: () => defineCustomElement('z-button'),
  events: {
    onPress: 'press',
  },
})
```

### `packages/web-c/output-react-wrapper/src/generateReactWrapper.ts`

```ts id="2lldst"
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateReactWrapperOptions {
  component: ComponentRecord
}

export function generateReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component } = input
  const events = createReactEventMap(component)

  return [
    `import React from 'react'`,
    `import { createComponent } from '@zeus-js/react-wrapper'`,
    `import { defineCustomElement } from '../wc/loader.js'`,
    ``,
    `export const ${component.name} = createComponent({`,
    `  tagName: ${JSON.stringify(component.tag)},`,
    `  react: React,`,
    `  defineCustomElement: () => defineCustomElement(${JSON.stringify(component.tag)}),`,
    `  events: ${formatObject(events)},`,
    `})`,
    ``,
  ].join('\n')
}

function createReactEventMap(
  component: ComponentRecord,
): Record<string, string> {
  const events: Record<string, string> = {}

  for (const [key, event] of Object.entries(component.events)) {
    const sourceEventName = event.key ?? key
    const domEventName = event.name ?? toKebabCase(sourceEventName)
    const reactPropName = event.reactName ?? toReactEventProp(sourceEventName)

    events[reactPropName] = domEventName
  }

  return events
}

function formatObject(value: Record<string, string>): string {
  const entries = Object.entries(value)

  if (!entries.length) {
    return '{}'
  }

  return `{\n${entries
    .map(([key, item]) => `    ${JSON.stringify(key)}: ${JSON.stringify(item)}`)
    .join(',\n')}\n  }`
}

function toReactEventProp(value: string): string {
  return `on${value
    .split('-')
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')}`
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
```

### 插件修改点

当前 `output-react-wrapper/src/index.ts` 会给 wrapper 传 `wcModuleId` 和 `mode`。改成：

```ts id="o1k6ds"
code: generateReactWrapper({
  component,
})
```

`OutputReactWrapperOptions` 建议改为：

```ts id="0tndxk"
export type ReactWrapperMode =
  | 'runtime'
  | 'legacy-minimal'
  | 'legacy-event-bridge'

export interface OutputReactWrapperOptions {
  outDir?: string
  stripPrefix?: string | false
  fileName?: (tag: string) => string
  dts?: DtsMode
  index?: boolean
  wrapper?: ReactWrapperMode
  excludeComponents?: string[]
  esModules?: boolean
}
```

默认：

```ts id="w2bhqn"
wrapper: 'runtime'
```

---

# 5. `@zeus-js/vue-wrapper`：参考 Stencil Vue，但去掉 Ionic 专属逻辑

Stencil Vue runtime 的 `defineContainer` 采用这些关键机制：

```txt id="ng1j5l"
1. defineCustomElement() 在 defineContainer 初始化时执行
2. componentProps 生成 Vue props，并使用 EMPTY_PROP 区分“未传入”
3. emitProps 生成 emits
4. modelProp/modelUpdateEvent/modelUpdateEventAttribute 支持 v-model
5. onMounted 注册 DOM event -> Vue emit
6. render 时把非 EMPTY_PROP 的 props 透传到 Web Component
```

这些都能从源码看到：`defineContainer` 签名和参数说明在 82-91 行，初始化时调用 `defineCustomElement()` 在 98-100 行，props/emits/modelValue 处理在 102-115 行。

Zeus 需要保留这些，去掉 Ionic 专属的 `routerLink/navManager` 分支。

### `packages/web-c/output-vue-wrapper/src/runtime/defineContainer.ts`

```ts id="u9doxa"
import {
  cloneVNode,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  PropType,
  ref,
  withDirectives,
} from 'vue'

const EMPTY_PROP = Symbol()
const DEFAULT_EMPTY_PROP = { default: EMPTY_PROP }
const UPDATE_MODEL_EVENT = 'update:modelValue'
const MODEL_VALUE = 'modelValue'

export interface ZeusVueModelOptions {
  prop: string
  event: string
  eventPath?: string
}

export interface ZeusVueContainerOptions<Props = unknown> {
  tagName: string
  displayName?: string
  defineCustomElement?: () => void
  props?: string[]
  events?: string[]
  slots?: string[]
  model?: ZeusVueModelOptions
  transformTag?: (tagName: string) => string
}

export function defineContainer<Props = unknown, VModelType = unknown>(
  options: ZeusVueContainerOptions<Props>,
) {
  const {
    tagName,
    displayName,
    defineCustomElement,
    props: componentProps = [],
    events: emitProps = [],
    slots: slotNames = [],
    model,
    transformTag,
  } = options

  defineCustomElement?.()

  const emits = [...emitProps]

  const props = componentProps.reduce(
    (acc, prop) => {
      acc[prop] = DEFAULT_EMPTY_PROP
      return acc
    },
    {} as Record<string, { type?: PropType<unknown>; default: symbol }>,
  )

  if (model) {
    emits.push(UPDATE_MODEL_EVENT)
    props[MODEL_VALUE] = DEFAULT_EMPTY_PROP
  }

  return defineComponent<Props>(
    (propsValue, { attrs, slots, emit }) => {
      const containerRef = ref<HTMLElement>()
      const listeners: Array<{
        eventName: string
        listener: EventListener
      }> = []

      onMounted(() => {
        const el = containerRef.value
        if (!el) return

        for (const eventName of emitProps) {
          const listener = (event: Event) => {
            emit(eventName, event)
          }

          el.addEventListener(eventName, listener)
          listeners.push({ eventName, listener })
        }
      })

      onBeforeUnmount(() => {
        const el = containerRef.value
        if (!el) return

        for (const item of listeners) {
          el.removeEventListener(item.eventName, item.listener)
        }

        listeners.length = 0
      })

      const vModelDirective = {
        created: (el: HTMLElement) => {
          if (!model) return

          el.addEventListener(model.event, event => {
            if ((event.target as HTMLElement).tagName !== el.tagName) {
              return
            }

            emit(
              UPDATE_MODEL_EVENT,
              readEventPath(event, model.eventPath ?? `target.${model.prop}`),
            )
          })
        },
      }

      return () => {
        const propsToAdd: Record<string, unknown> = {
          ref: containerRef,
        }

        for (const key in propsValue) {
          const value = (propsValue as Record<string, unknown>)[key]

          if (value !== EMPTY_PROP) {
            propsToAdd[key] = value
          }
        }

        for (const key in attrs) {
          propsToAdd[key] = attrs[key]
        }

        if (model) {
          const modelValue = (propsValue as Record<string, unknown>)[
            MODEL_VALUE
          ]
          const modelPropValue = (propsValue as Record<string, unknown>)[
            model.prop
          ]

          if (modelValue !== EMPTY_PROP) {
            propsToAdd[model.prop] = modelValue
          } else if (modelPropValue !== EMPTY_PROP) {
            propsToAdd[model.prop] = modelPropValue
          }
        }

        const children = createChildren(slots, slotNames)
        const finalTagName = transformTag ? transformTag(tagName) : tagName
        const node = h(finalTagName, propsToAdd, children)

        return model ? withDirectives(node, [[vModelDirective]]) : node
      }
    },
    {
      name: displayName ?? tagName,
      props,
      emits,
    },
  )
}

function createChildren(slots: Record<string, any>, slotNames: string[]) {
  const children = slots.default ? slots.default() : []

  for (const name of slotNames) {
    const slot = slots[name]
    if (!slot) continue

    for (const vnode of slot()) {
      children.push(withSlot(name, vnode))
    }
  }

  return children
}

function withSlot(name: string, vnode: unknown): unknown {
  if (!vnode) return vnode

  if (typeof vnode === 'string') {
    return h('span', { slot: name, style: 'display: contents' }, vnode)
  }

  return cloneVNode(vnode as any, { slot: name })
}

function readEventPath(event: Event, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value == null) return undefined
    return (value as Record<string, unknown>)[key]
  }, event)
}
```

### `packages/web-c/output-vue-wrapper/src/runtime/index.ts`

```ts id="n2pmbr"
export { defineContainer }
export type {
  ZeusVueContainerOptions,
  ZeusVueModelOptions,
} from './defineContainer'
```

---

# 6. `output-vue-wrapper`：只生成代理

Stencil Vue generator 会把组件 properties 转成 props，把 events 同时加入 props/emits，并基于 `componentModels` 生成 v-model 参数。

Zeus 不建议完全复刻它的“位置参数字符串拼接”，因为那导致 generator 里大量条件模板。Zeus 用对象参数更稳：

```ts id="tlxmr9"
defineContainer({
  tagName,
  defineCustomElement,
  props,
  events,
  slots,
  model,
})
```

### `packages/web-c/output-vue-wrapper/src/generateVueWrapper.ts`

```ts id="6tdz7y"
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateVueWrapperOptions {
  component: ComponentRecord
}

export function generateVueWrapper(input: GenerateVueWrapperOptions): string {
  const { component } = input
  const propNames = Object.keys(component.props)
  const eventNames = getEventNames(component)
  const slotNames = Object.keys(component.slots).filter(
    name => name !== 'default',
  )
  const model = component.models?.[0]

  return [
    `import { defineContainer } from '@zeus-js/vue-wrapper'`,
    `import { defineCustomElement } from '../wc/loader.js'`,
    ``,
    `export const ${component.name} = defineContainer({`,
    `  tagName: ${JSON.stringify(component.tag)},`,
    `  displayName: ${JSON.stringify(component.name)},`,
    `  defineCustomElement: () => defineCustomElement(${JSON.stringify(component.tag)}),`,
    `  props: ${JSON.stringify(propNames)},`,
    `  events: ${JSON.stringify(eventNames)},`,
    `  slots: ${JSON.stringify(slotNames)},`,
    `  model: ${model ? formatModel(model) : 'undefined'},`,
    `})`,
    ``,
  ].join('\n')
}

function getEventNames(component: ComponentRecord): string[] {
  return Array.from(
    new Set(
      Object.entries(component.events).map(([key, event]) => {
        return event.name ?? toKebabCase(event.key ?? key)
      }),
    ),
  )
}

function formatModel(model: {
  prop: string
  event: string
  eventPath?: string
}): string {
  return `{
    prop: ${JSON.stringify(model.prop)},
    event: ${JSON.stringify(model.event)},
    eventPath: ${JSON.stringify(model.eventPath)},
  }`
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
```

生成结果：

```ts id="5rc5tw"
import { defineContainer } from '@zeus-js/output-vue-wrapper/runtime'
import { defineCustomElement } from '../wc/loader.js'

export const ZInput = defineContainer({
  tagName: 'z-input',
  displayName: 'ZInput',
  defineCustomElement: () => defineCustomElement('z-input'),
  props: ['value', 'disabled', 'placeholder'],
  events: ['value-change', 'focus-change'],
  slots: ['prefix', 'suffix'],
  model: {
    prop: 'value',
    event: 'value-change',
    eventPath: 'detail.value',
  },
})
```

---

# 7. output target options 对齐 Stencil，但按 Zeus 命名

Stencil React output target 有 `outDir / excludeComponents / stencilPackageName / customElementsDir / hydrateModule / clientModule / esModules / transformTag` 等配置。
Stencil Vue output target 也有 `includeImportCustomElements / includeDefineCustomElements / esModules / componentModels / transformTag` 这一类行为。源码里 `esModules` 会决定生成单文件代理还是每组件代理。

Zeus 建议：

```ts id="s7kgvo"
export interface OutputReactWrapperOptions {
  outDir?: string
  stripPrefix?: string | false
  fileName?: (tag: string) => string
  dts?: DtsMode
  index?: boolean

  /**
   * runtime:
   *   Default. Generate Stencil-style proxies powered by @zeus-js/react-wrapper.
   *
   * legacy-minimal / legacy-event-bridge:
   *   Temporary compatibility mode for current generated wrappers.
   */
  wrapper?: 'runtime' | 'legacy-minimal' | 'legacy-event-bridge'

  /**
   * Generate one wrapper file per component.
   *
   * @default true
   */
  esModules?: boolean

  excludeComponents?: string[]

  /**
   * Future SSR support, not P0.
   */
  hydrateModule?: string
  clientModule?: string
  transformTag?: boolean
}
```

```ts id="jow9q2"
export interface OutputVueWrapperOptions {
  outDir?: string
  stripPrefix?: string | false
  fileName?: (tag: string) => string
  dts?: DtsMode
  globalDts?: DtsMode
  index?: boolean

  wrapper?: 'runtime' | 'legacy-minimal' | 'legacy-event-bridge'
  esModules?: boolean
  excludeComponents?: string[]
  transformTag?: boolean
}
```

---

# 8. 测试策略

## React wrapper 生成测试

```ts id="fm0gi4"
it('generates Stencil-style React proxy', () => {
  const code = generateReactWrapper({
    component: createButtonRecord(),
  })

  expect(code).toContain("import React from 'react'")
  expect(code).toContain(
    "import { createComponent } from '@zeus-js/react-wrapper'",
  )
  expect(code).toContain(
    "import { defineCustomElement } from '../wc/loader.js'",
  )
  expect(code).toContain('export const ZButton = createComponent')
  expect(code).toContain('tagName: "z-button"')
  expect(code).toContain(
    'defineCustomElement: () => defineCustomElement("z-button")',
  )
  expect(code).toContain('"onPress": "press"')

  expect(code).not.toContain('import "zeus:wc:z-button"')
  expect(code).not.toContain('useEffect')
  expect(code).not.toContain('addEventListener')
})
```

## Vue wrapper 生成测试

```ts id="6akffs"
it('generates Stencil-style Vue proxy', () => {
  const code = generateVueWrapper({
    component: createInputRecord(),
  })

  expect(code).toContain(
    "import { defineContainer } from '@zeus-js/vue-wrapper'",
  )
  expect(code).toContain(
    "import { defineCustomElement } from '../wc/loader.js'",
  )
  expect(code).toContain('export const ZInput = defineContainer')
  expect(code).toContain('tagName: "z-input"')
  expect(code).toContain('props: ["value","disabled"]')
  expect(code).toContain('events: ["value-change"]')
  expect(code).toContain('model:')
  expect(code).not.toContain('import "zeus:wc:z-input"')
  expect(code).not.toContain('onMounted')
  expect(code).not.toContain('addEventListener')
})
```

## `wc/loader` 测试

```ts id="fbyjfr"
it('defines a single lazy custom element by tag name', () => {
  const code = generateLoader()

  expect(code).toContain('export function defineCustomElement')
  expect(code).toContain('componentsByTagName.get(tagName)')
  expect(code).toContain('bootstrapLazy([component], { registry })')
  expect(code).toContain('export function defineCustomElements')
})
```

---

# 9. 落地顺序

```txt id="t5qcgi"
Phase 0
  output-wc loader 增加 defineCustomElement(tagName)
  web-c-runtime bootstrapLazy 支持 registry options
  补测试

Phase 1
  新增 @zeus-js/react-wrapper
  createComponent 基于 @lit/react
  补 React runtime 测试

Phase 2
  output-react-wrapper 默认 wrapper: "runtime"
  生成 Stencil-style proxy
  legacy-minimal / legacy-event-bridge 暂留

Phase 3
  新增 @zeus-js/vue-wrapper
  defineContainer 参考 Stencil Vue runtime
  删除 Ionic 专属逻辑，只保留 props/events/model/class/slots

Phase 4
  output-vue-wrapper 默认 wrapper: "runtime"
  生成 Stencil-style proxy
  支持 model metadata

Phase 5
  examples/react-wrapper、examples/vue-wrapper 改为新产物
  docs 更新：React/Vue wrapper 不再负责重复注册逻辑
```

---

# 最终结论

参考 `stenciljs/output-targets` 后，Zeus 不应该再做“每个 wrapper 内生成完整实现”的方案，而应该变成：

```txt id="43svi5"
React:
  generator:
    export const ZButton = createComponent({ tagName, react, events, defineCustomElement })

  runtime:
    @zeus-js/output-react-wrapper/runtime/createComponent
    内部委托 @lit/react

Vue:
  generator:
    export const ZInput = defineContainer({ tagName, props, events, model, defineCustomElement })

  runtime:
    @zeus-js/output-vue-wrapper/runtime/defineContainer
    内部处理 props / emits / v-model / slot / class

WC:
  loader:
    defineCustomElement(tagName)
    defineCustomElements()
```

这才和 Stencil 的架构一致：**output target 只生成代理协议，真正的框架适配集中在 runtime helper。**
