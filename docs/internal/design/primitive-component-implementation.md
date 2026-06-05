# Primitive Component Protocol Implementation Design

本文基于 [Primitive Component Protocol](./primitive-component-protocol.md) 和当前 `packages/web-c/*`、`packages/core/runtime-dom` 现状，给出协议落地的完整实现设计与代码草案。

目标是把协议拆成可执行的工程改动，后续可以按阶段分别提交 PR。

## 现状结论

当前仓库已经具备 Web-C 工具链基础：

| 模块                                | 已有能力                                      | 主要缺口                                                        |
| ----------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `@zeus-js/runtime-dom`              | `defineElement`、props bridge、light DOM slot | 缺 `prop()`、`event()`、`emits`、强类型 `emit`、`expose()`      |
| `@zeus-js/component-analyzer`       | 解析 `props`、`meta`、部分 setup metadata     | 缺 `emits`、`event()`、`prop(values)`、`Function`、`ctx.expose` |
| `@zeus-js/output-wc`                | lazy / side-effect 输出、loader、manifest     | lazy manifest 缺 method proxy 元信息，事件元数据不完整          |
| `@zeus-js/web-c-runtime`            | lazy Proxy Element、prop bridge、ready        | 缺 lazy method proxy                                            |
| `@zeus-js/output-react-wrapper`     | minimal / event-bridge 雏形                   | event bridge 应消费规范化事件元数据                             |
| `@zeus-js/output-vue-wrapper`       | minimal / event-bridge 雏形                   | Vue emits 应消费 DOM event name                                 |
| `@zeus-js/component-dts`            | WC / JSX / React / Vue d.ts 生成              | 需要扩展事件、methods、slots、function prop 类型                |
| `@zeus-js/preset-component-library` | 组合 WC / React / Vue / CSS 输出              | 可接入声明事件后自动选择 wrapper bridge                         |
| `@zeus-js/web-c`                    | 未存在                                        | 需要新增聚合包                                                  |

## 分阶段实现

### P1：协议核心

P1 只处理能直接支撑 primitive 组件库的能力：

1. `defineElement` 支持 `prop()`、`event()`、`emits`、`expose()`。
2. analyzer 支持从源码提取 props、emits、slots、parts、methods。
3. manifest 扩展事件、method、slot、part、css var 元数据。
4. lazy runtime 支持 method proxy。
5. React / Vue wrapper 的 event bridge 使用规范化事件元数据。
6. 新增 `@zeus-js/web-c` 聚合包。

### P2：增强能力

P2 先只保留协议入口，不阻塞 P1：

1. `formAssociated` 的 ElementInternals 完整实现。
2. 更完整的 detail 类型 AST 提取。
3. 更严格的 manifest schema 校验。
4. 文档站和 registry 对 manifest 的消费。

## Manifest Contract

`ComponentRecord` 是 analyzer 到所有 output plugin 的共享契约。建议先扩展 `packages/web-c/component-analyzer/src/types.ts`。

代码草案：

```ts
export type ComponentPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'unknown'

export interface ComponentRecord {
  tag: string
  name: string
  exportName: string
  source: string

  props: Record<string, ComponentProp>
  runtimeProps?: Record<string, ComponentProp>
  runtimePropsDiagnostics?: string[]

  events: Record<string, ComponentEvent>
  methods: Record<string, ComponentMethod>
  slots: Record<string, ComponentSlot>

  hostAttributes: string[]
  cssParts: string[]
  cssVars: Record<string, ComponentCssVar>

  description?: string
  meta?: ComponentMeta
}

export interface ComponentMeta {
  shadow?: boolean
  formAssociated?: boolean
  [key: string]: unknown
}

export interface ComponentProp {
  type: ComponentPropType
  required?: boolean
  values?: string[]
  default?: unknown
  reflect?: boolean
  attr?: string | false
  description?: string
}

export interface ComponentEvent {
  /**
   * Source key in defineElement({ emits }).
   * Example: valueChange.
   */
  key: string

  /**
   * DOM CustomEvent name.
   * Example: value-change.
   */
  name: string

  /**
   * React wrapper prop name.
   * Example: onValueChange.
   */
  reactName: string

  detail?: Record<string, string>
  bubbles: boolean
  composed: boolean
  cancelable: boolean
  description?: string
}

export interface ComponentMethod {
  name: string
  description?: string
}

export interface ComponentSlot {
  name: string
  description?: string
}

export interface ComponentCssVar {
  name: string
  description?: string
}
```

兼容策略：

1. `events` 仍保留为 record，key 使用 `emits` key。
2. 旧的字符串 `emit('value-change')` 可继续被 analyzer 作为 fallback 事件来源，但不作为推荐协议。
3. `cssVars` 从 `string[]` 迁移为 record 时，output 层先同时兼容数组和 record，避免一次性破坏全部测试。

## Runtime API

### Public Surface

`@zeus-js/zeus` 需要从 `runtime-dom` 导出：

```ts
export { defineElement, event, prop, Host } from '@zeus-js/runtime-dom'
```

`packages/core/runtime-dom/src/defineElement.ts` 增加协议入口。

代码草案：

```ts
export type ElementPropConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ObjectConstructor
  | ArrayConstructor
  | FunctionConstructor

export interface PropDefinitionOptions<T = unknown> {
  type?: ElementPropConstructor
  attr?: string | false
  reflect?: boolean
  default?: T | (() => T)
  values?: readonly T[]
}

export type PropDefinition<T = unknown> =
  | ElementPropConstructor
  | PropDefinitionOptions<T>

export interface ValuePropDefinition<
  T = unknown,
> extends PropDefinitionOptions<T> {
  type: StringConstructor
  values: readonly T[]
}

export function prop<const V extends readonly string[]>(
  values: V,
  options: Omit<PropDefinitionOptions<V[number]>, 'type' | 'values'> = {},
): ValuePropDefinition<V[number]> {
  return {
    type: String,
    values,
    attr: options.attr,
    reflect: options.reflect,
    default: options.default,
  }
}
```

说明：

1. `prop(values)` 只表达 string literal union，避免和数组 prop 语义冲突。
2. `Array` 仍然表示 JS property 的数组类型。
3. `Function` 默认 `attr: false`。

### Event Definition

代码草案：

```ts
export interface EventDefinition<Detail = unknown> {
  __zeusEvent: true
  name?: string
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
}

export interface EventOptions {
  name?: string
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
}

export function event<Detail = unknown>(): EventDefinition<Detail>
export function event<Detail = unknown>(name: string): EventDefinition<Detail>
export function event<Detail = unknown>(
  options: EventOptions,
): EventDefinition<Detail>
export function event<Detail = unknown>(
  input?: string | EventOptions,
): EventDefinition<Detail> {
  if (typeof input === 'string') {
    return {
      __zeusEvent: true,
      name: input,
    }
  }

  return {
    __zeusEvent: true,
    name: input && input.name,
    bubbles: input && input.bubbles,
    composed: input && input.composed,
    cancelable: input && input.cancelable,
  }
}
```

默认值由 runtime normalize：

```ts
const DEFAULT_EVENT_OPTIONS = {
  bubbles: true,
  composed: true,
  cancelable: false,
}
```

当前 runtime 里 `cancelable` 默认是 `true`，协议要求改为 `false`。这是一个可观察行为变化，必须用测试锁住。

### DefineElement Options

代码草案：

```ts
export interface DefineElementOptions<
  P extends object,
  E extends EmitsOptions = {},
> {
  shadow?: boolean | ShadowRootInit
  formAssociated?: boolean
  props?: PropOptions<P>
  emits?: E
  styles?: string | string[]
  consumes?: Context<unknown>[]
  slots?: readonly string[]
  parts?: readonly string[]
  cssVars?: Record<string, { description?: string }>
  meta?: DefineElementMeta
}

export interface EmitsOptions {
  [key: string]: EventDefinition<unknown>
}
```

`slots`、`parts`、`cssVars` 在 P1 主要是 metadata 入口，runtime 不消费。

### Emit Context

保留旧字符串 API，同时提供推荐的强类型方法 API。

代码草案：

```ts
export interface EmitFunction {
  (name: string, detail?: unknown, options?: CustomEventInit): boolean
}

export type EmitApi<E extends EmitsOptions> = EmitFunction & {
  [K in keyof E]: E[K] extends EventDefinition<infer Detail>
    ? (detail: Detail, options?: CustomEventInit) => boolean
    : never
}

export interface DefineElementContext<
  E extends HTMLElement = HTMLElement,
  Emits extends EmitsOptions = {},
> {
  host: E
  emit: EmitApi<Emits>
  expose(methods: Record<string, Function>): void
}
```

runtime 创建 `emit`：

```ts
function createEmitApi(
  host: HTMLElement,
  emits: EmitsOptions | undefined,
): EmitFunction {
  const emit = function (
    name: string,
    detail?: unknown,
    options?: CustomEventInit,
  ): boolean {
    const eventName = resolveEventName(name, emits)
    const eventOptions = resolveEventOptions(name, emits, options)

    return host.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: eventOptions.bubbles,
        composed: eventOptions.composed,
        cancelable: eventOptions.cancelable,
        detail,
      }),
    )
  } as EmitFunction

  if (emits) {
    for (const key of Object.keys(emits)) {
      Object.defineProperty(emit, key, {
        enumerable: true,
        configurable: true,
        value(detail: unknown, options?: CustomEventInit): boolean {
          return emit(key, detail, options)
        },
      })
    }
  }

  return emit
}
```

`resolveEventName('valueChange')` 应优先读取 `emits.valueChange.name`，否则推导为 `value-change`。如果用户传旧的 `'value-change'` 字符串，且 `emits` 中没有该 key，则原样派发。

### Expose Context

`expose()` 需要满足两个场景：

1. side-effect/full custom element：方法直接挂到 host。
2. lazy custom element：proxy class 先生成占位方法，加载后转发到真实方法。

runtime 代码草案：

```ts
function createExpose(
  host: HTMLElement,
): (methods: Record<string, Function>) => void {
  return methods => {
    for (const key of Object.keys(methods)) {
      Object.defineProperty(host, key, {
        configurable: true,
        enumerable: false,
        value: methods[key],
      })
    }
  }
}
```

`mountElementDefinition()` 返回值扩展：

```ts
export interface MountedElementDefinition {
  propertyChanged(name: string, oldValue: unknown, newValue: unknown): void
  callMethod?(name: string, args: unknown[]): unknown
  dispose(): void
}
```

但更简单的 P1 方案是 `expose()` 直接写 host 方法，lazy proxy 加载完成后通过 `host[method](...)` 调用真实方法即可，不需要额外 `callMethod`。

## Analyzer

Analyzer 是这次改动的核心。所有 output 都应消费 analyzer 结果，不重新猜测源码。

### Props

修改 `packages/web-c/component-analyzer/src/extractProps.ts`：

1. `isPropConstructorName()` 增加 `Function`。
2. `typeFromConstructorName()` 增加 `'function'`。
3. 支持 `prop([...], options)`。
4. 支持对象写法中的 `values`。
5. `attr` 默认值不一定写入 `ComponentProp.attr`，但 output 层必须能用 key 推导。

代码草案：

```ts
function extractRuntimeProp(node: t.Expression | t.PatternLike): ComponentProp {
  if (t.isIdentifier(node)) {
    return {
      type: typeFromConstructorName(node.name),
    }
  }

  if (isPropCall(node)) {
    return extractPropCall(node)
  }

  if (t.isObjectExpression(node)) {
    return extractPropOptions(node)
  }

  return {
    type: 'unknown',
  }
}

function isPropCall(node: t.Node): node is t.CallExpression {
  return (
    t.isCallExpression(node) && t.isIdentifier(node.callee, { name: 'prop' })
  )
}

function extractPropCall(node: t.CallExpression): ComponentProp {
  const valuesNode = node.arguments[0]
  const optionsNode = node.arguments[1]
  const values = t.isArrayExpression(valuesNode)
    ? valuesNode.elements
        .map(item => (t.isStringLiteral(item) ? item.value : undefined))
        .filter((item): item is string => typeof item === 'string')
    : []

  const prop = t.isObjectExpression(optionsNode)
    ? extractPropOptions(optionsNode)
    : { type: 'string' as ComponentPropType }

  prop.type = 'string'
  prop.values = values

  return prop
}
```

validation 规则：

1. `prop()` 第一个参数必须是静态字符串数组。
2. `prop()` 第二个参数必须是 inline object literal 或省略。
3. `values` 必须是静态字符串数组。
4. `Function` prop 自动视为非 attribute-backed，除非用户显式写 `attr`，这种情况应 warning。

### Emits

新增 `packages/web-c/component-analyzer/src/extractEmits.ts`。

输入：

```ts
emits: {
  valueChange: event<{ value: string }>(),
  focusChange: event({ bubbles: true }),
  custom: event('custom-event'),
}
```

输出：

```ts
{
  valueChange: {
    key: 'valueChange',
    name: 'value-change',
    reactName: 'onValueChange',
    bubbles: true,
    composed: true,
    cancelable: false,
  }
}
```

代码草案：

```ts
export function extractEmits(
  options: t.ObjectExpression | undefined,
): Record<string, ComponentEvent> {
  const emitsNode = options && getObjectProperty(options, 'emits')

  if (!t.isObjectExpression(emitsNode)) return {}

  const events: Record<string, ComponentEvent> = {}

  for (const member of emitsNode.properties) {
    if (!t.isObjectProperty(member) || member.computed) continue

    const key = getObjectKey(member.key)
    if (!key) continue

    const eventMeta = extractEventDefinition(key, member.value)
    events[key] = eventMeta
  }

  return events
}

function extractEventDefinition(
  key: string,
  node: t.Expression | t.PatternLike,
): ComponentEvent {
  const defaults = {
    key,
    name: toKebabCase(key),
    reactName: toReactEventProp(key),
    bubbles: true,
    composed: true,
    cancelable: false,
  }

  if (!t.isCallExpression(node)) return defaults
  if (!t.isIdentifier(node.callee, { name: 'event' })) return defaults

  const first = node.arguments[0]

  if (t.isStringLiteral(first)) {
    return {
      ...defaults,
      name: first.value,
      reactName: toReactEventProp(first.value),
    }
  }

  if (t.isObjectExpression(first)) {
    return {
      ...defaults,
      name: readStaticString(first, 'name') || defaults.name,
      bubbles: readStaticBoolean(first, 'bubbles', defaults.bubbles),
      composed: readStaticBoolean(first, 'composed', defaults.composed),
      cancelable: readStaticBoolean(first, 'cancelable', defaults.cancelable),
    }
  }

  return defaults
}
```

实际实现中不要用对象展开，按项目规则改成 `Object.assign` 或显式赋值。

### Setup Metadata

修改 `packages/web-c/component-analyzer/src/extractSetup.ts`：

1. slot 同时识别 `<slot>` 和 `<Slot>`。
2. css parts 继续从静态 `part=""` 提取，并支持空格拆分。
3. methods 从 `expose({ focus() {}, blur() {} })`、`ctx.expose({ ... })` 提取。
4. events fallback 识别 `emit('value-change')`、`ctx.emit('value-change')`、`emit.valueChange(...)`。

代码草案：

```ts
export interface SetupMeta {
  events: Record<string, ComponentEvent>
  methods: Record<string, ComponentMethod>
  slots: Record<string, ComponentSlot>
  hostAttributes: string[]
  cssParts: string[]
}

function extractSlot(node: t.Node, slots: Record<string, ComponentSlot>): void {
  if (!t.isJSXElement(node)) return

  const name = node.openingElement.name

  if (
    !t.isJSXIdentifier(name, { name: 'slot' }) &&
    !t.isJSXIdentifier(name, { name: 'Slot' })
  ) {
    return
  }

  const slotName = getJSXStringAttribute(node, 'name') || 'default'

  slots[slotName] = {
    name: slotName,
  }
}

function extractExpose(
  node: t.Node,
  methods: Record<string, ComponentMethod>,
): void {
  if (!t.isCallExpression(node)) return
  if (!isExposeCallee(node.callee)) return

  const first = node.arguments[0]
  if (!t.isObjectExpression(first)) return

  for (const member of first.properties) {
    if (!t.isObjectMethod(member) && !t.isObjectProperty(member)) continue

    const name = getObjectKey(member.key)
    if (!name) continue

    methods[name] = {
      name,
    }
  }
}
```

`extractDefineElement.ts` 负责合并：

1. `runtimeProps` 来自 `options.props`。
2. `events` 优先来自 `options.emits`，再补充 setup fallback。
3. `slots` 来自 JSX slot 与显式 `options.slots` 合并。
4. `cssParts` 来自 JSX part 与显式 `options.parts` 合并。
5. `cssVars` 来自 `options.cssVars` 和 `meta.cssVars` 兼容合并。
6. `methods` 来自 setup `expose()`。
7. `meta.shadow`、`meta.formAssociated` 来自 options。

## Output WC

### Lazy Manifest

修改 `packages/web-c/output-wc/src/generateLazyManifest.ts`：

```ts
return `  {
    tagName: ${JSON.stringify(component.tag)},
    shadow: ${component.meta && component.meta.shadow === true ? 'true' : 'false'},
    load: () => import(${importPath}),
    props: ${props},
    methods: ${JSON.stringify(Object.keys(component.methods || {}))},
  }`
```

`methods` 为空时可以省略，减少产物体积。

`generatePropsArray()` 增加：

```ts
function isAttributeBackedType(type: ComponentProp['type']): boolean {
  return type === 'string' || type === 'number' || type === 'boolean'
}
```

`function`、`object`、`array` 默认输出 `attrName: false`。

### Custom Elements JSON

`packages/web-c/output-wc/src/generateCustomElementsJson.ts` 需要消费新字段：

1. `events` 使用 `event.name` 作为 DOM event name。
2. `members` 包含 exposed methods。
3. `slots` 使用 `slot.name`。
4. `cssParts` 和 `cssVars` 输出公共样式 API。
5. `attributes` 只包含 attribute-backed props。

### Zeus Manifest

`zeus.components.json` 建议输出完整协议，供 registry、docs、AI 消费：

```json
{
  "version": 1,
  "components": [
    {
      "tag": "zw-input",
      "name": "Input",
      "props": {},
      "events": {},
      "methods": {},
      "slots": {},
      "cssParts": [],
      "cssVars": {},
      "shadow": false,
      "formAssociated": false
    }
  ]
}
```

## Web-C Runtime

`packages/web-c/web-c-runtime/src/types.ts` 扩展：

```ts
export interface ZeusLazyComponentMeta {
  tagName: string
  load: () => Promise<ZeusComponentModule | { default: ZeusComponentModule }>
  props: ZeusPropMeta[]
  methods?: string[]
  shadow?: boolean
}
```

`packages/web-c/web-c-runtime/src/lazy-element.ts` 增加 method proxy 安装：

```ts
function installMethodProxies(
  proto: HTMLElement,
  methods: readonly string[] | undefined,
): void {
  if (!methods) return

  for (const name of methods) {
    if (name in proto) continue

    Object.defineProperty(proto, name, {
      configurable: true,
      value: function (...args: unknown[]): Promise<unknown> {
        const hostRef = requireHostRef(this as HTMLElement)

        return waitForComponentReady(hostRef).then(host => {
          const method = (host as HTMLElement & Record<string, unknown>)[name]

          if (typeof method !== 'function') {
            throw new Error(
              `[zeus:web-c] Method "${name}" is not exposed on <${hostRef.meta.tagName}>.`,
            )
          }

          return method.apply(host, args)
        })
      },
    })
  }
}
```

调用位置：

```ts
installPropertyAccessors(
  ZeusLazyElement.prototype as unknown as HTMLElement,
  meta.props,
)

installMethodProxies(
  ZeusLazyElement.prototype as unknown as HTMLElement,
  meta.methods,
)
```

注意：项目当前 ES2016 约束不推荐 rest/spread，实际实现可改成 `Array.prototype.slice.call(arguments)`。

## React Wrapper

当前 `output-react-wrapper` 已有 `event-bridge`，主要改为消费新事件 metadata。

代码草案：

```ts
function createEventBindings(
  events: Record<string, ComponentEvent>,
): EventBinding[] {
  return Object.keys(events).map((key, index) => {
    const event = events[key]

    return {
      eventName: event.name,
      sourceName: event.reactName,
      localName: `eventHandler${index}`,
    }
  })
}
```

生成逻辑保持：

```ts
el.addEventListener('value-change', handler)
```

验收点：

1. `onValueChange` 不进入 `rest`。
2. handler 变化时解绑旧 listener。
3. unmount 解绑 listener。
4. `ref` 指向底层 custom element。

Preset 默认仍可保持 `minimal`。如果想降低用户心智负担，可以在 `componentLibrary()` 增加：

```ts
wrapper?: 'minimal' | 'event-bridge' | 'auto'
```

`auto` 表示组件声明事件时 wrapper 用 event bridge。P1 建议先保留现有默认 `minimal`，避免额外行为变化；组件库可以显式配置 `wrapper: 'event-bridge'`。

## Vue Wrapper

当前 `output-vue-wrapper` 也已有 `event-bridge`，主要改为：

```ts
const eventNames = Object.keys(component.events).map(key => {
  return component.events[key].name
})
```

Vue `emit(eventName, event)` 继续使用 kebab-case DOM event name。

类型生成中：

```ts
{
  'value-change': (event: CustomEvent<{ value: string }>) => void
}
```

## Component DTS

`packages/web-c/component-dts` 需要消费扩展字段：

1. WC element interface 包含 props 和 exposed methods。
2. JSX IntrinsicElements 包含 attribute-backed props、property props、event handler 类型。
3. React props 包含 `onValueChange?: (event: CustomEvent<Detail>) => void`。
4. Vue emits 使用 DOM event name。
5. `function` prop 映射为 `Function` 或更宽的 callable 类型，后续从 TS props 推导精化。

方法类型 P1 可以先输出 `(...args: unknown[]) => Promise<unknown> | unknown`，P2 再从源码签名精化。

## Aggregate Package `@zeus-js/web-c`

新增目录：

```txt
packages/web-c/web-c/
  package.json
  index.js
  vite.js
  rollup.js
  rolldown.js
  src/
    index.ts
    vite.ts
    rollup.ts
    rolldown.ts
```

`package.json` 草案：

```json
{
  "name": "@zeus-js/web-c",
  "version": "0.1.0-beta.3",
  "description": "Zeus Web-C component library toolchain",
  "type": "module",
  "main": "index.js",
  "module": "dist/web-c.esm-bundler.js",
  "types": "dist/web-c.d.ts",
  "files": ["index.js", "vite.js", "rollup.js", "rolldown.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/web-c.d.ts",
      "module": "./dist/web-c.esm-bundler.js",
      "import": "./dist/web-c.esm-bundler.js",
      "require": "./index.js"
    },
    "./vite": {
      "types": "./dist/vite.d.ts",
      "import": "./dist/vite.js"
    },
    "./rollup": {
      "types": "./dist/rollup.d.ts",
      "import": "./dist/rollup.js"
    },
    "./rolldown": {
      "types": "./dist/rolldown.d.ts",
      "import": "./dist/rolldown.js"
    }
  },
  "dependencies": {
    "@zeus-js/bundler-plugin": "workspace:*",
    "@zeus-js/component-analyzer": "workspace:*",
    "@zeus-js/component-dts": "workspace:*",
    "@zeus-js/output-css": "workspace:*",
    "@zeus-js/output-icons": "workspace:*",
    "@zeus-js/output-react-wrapper": "workspace:*",
    "@zeus-js/output-vue-wrapper": "workspace:*",
    "@zeus-js/output-wc": "workspace:*",
    "@zeus-js/preset-component-library": "workspace:*"
  },
  "peerDependencies": {
    "rolldown": "^1.0.0",
    "rollup": "^4.0.0",
    "vite": "^8.0.0"
  },
  "peerDependenciesMeta": {
    "rolldown": { "optional": true },
    "rollup": { "optional": true },
    "vite": { "optional": true }
  }
}
```

入口代码草案：

```ts
// src/index.ts
export { componentLibrary } from '@zeus-js/preset-component-library'
export { default as css } from '@zeus-js/output-css'
export { default as icons } from '@zeus-js/output-icons'
export { default as react } from '@zeus-js/output-react-wrapper'
export { default as vue } from '@zeus-js/output-vue-wrapper'
export { default as wc } from '@zeus-js/output-wc'

export { analyzeComponents, analyzeFile } from '@zeus-js/component-analyzer'

export {
  generateReactDts,
  generateVueDts,
  generateWCDtsFiles,
  generateWCJsxDts,
} from '@zeus-js/component-dts'

export { createOutputRegistry, resolvePluginDts } from '@zeus-js/bundler-plugin'
```

```ts
// src/rolldown.ts
export { default, zeus } from '@zeus-js/bundler-plugin/rolldown'
export { componentLibrary } from '@zeus-js/preset-component-library'
export * from './index'
```

`vite.ts` 和 `rollup.ts` 同理。

根入口兼容文件：

```js
// rolldown.js
module.exports = require('./dist/rolldown.cjs')
```

如果该包保持 `"type": "module"`，则不建议提供 CommonJS `require` 入口，避免 `module.exports` 和 ESM package type 冲突。更稳妥的方案是只提供 ESM import，和现有 Web-C 包保持一致后再决定。

## Implementation Order

推荐按下面顺序落地，避免一次改动同时打穿 runtime、analyzer、输出和类型：

1. 扩展 `ComponentRecord` 类型，并让现有 output 兼容新旧字段。
2. runtime-dom 增加 `prop()`、`event()`、`emits`、`expose()`，补单元测试。
3. analyzer 增加 props/emits/setup metadata 提取，补 analyzer fixture 测试。
4. output-wc lazy manifest 增加 `methods`，web-c-runtime 增加 method proxy，补 lazy 测试。
5. React/Vue wrapper 改用 `event.name` / `event.reactName`，补 wrapper 生成测试。
6. component-dts 扩展事件和 methods 类型。
7. 新增 `@zeus-js/web-c` 聚合包，补 re-export smoke test。
8. 更新 `docs/internal/packages.md`，把新公共 API 作为唯一权威来源登记。

## Acceptance Tests

### Runtime

新增或扩展：

- `packages/core/runtime-dom/__tests__/defineElement.props.spec.tsx`
- `packages/core/runtime-dom/__tests__/defineElement.spec.tsx`

场景：

1. `prop(['a', 'b'], { default: 'a' })` 默认值可读。
2. `Function` prop 不通过 attribute 同步。
3. `event()` 默认派发 `{ bubbles: true, composed: true, cancelable: false }`。
4. `emit.valueChange(detail)` 派发 `value-change`。
5. `event('custom-name')` 派发自定义 DOM event name。
6. `expose({ focus })` 后 host 可以调用 `focus()`。

### Analyzer

新增 fixture：

```tsx
defineElement(
  'zw-input',
  {
    shadow: false,
    props: {
      value: String,
      type: prop(['text', 'password'], { default: 'text', reflect: true }),
      formatter: Function,
    },
    emits: {
      valueChange: event<{ value: string }>(),
    },
  },
  (_props, { emit, expose }) => {
    expose({
      focus() {},
    })

    return (
      <Host>
        <slot name="prefix" />
        <input part="control" onInput={() => emit.valueChange({ value: '' })} />
      </Host>
    )
  },
)
```

断言：

1. `props.type.values === ['text', 'password']`。
2. `props.formatter.type === 'function'`。
3. `events.valueChange.name === 'value-change'`。
4. `events.valueChange.reactName === 'onValueChange'`。
5. `methods.focus` 存在。
6. `slots.prefix` 存在。
7. `cssParts` 包含 `control`。
8. `meta.shadow === false`。

### Output

1. lazy manifest 包含 `methods: ['focus']`。
2. generated custom-elements.json 包含 event、method、slot、css part。
3. React event bridge 生成 `addEventListener('value-change', ...)`。
4. React wrapper 不透传 `onValueChange` 到 custom element props。
5. Vue wrapper `emits` 包含 `'value-change'`。
6. WC JSX d.ts 能识别 `<zw-input value="x" />`。

### Aggregate Package

新增测试：

```ts
import { componentLibrary, wc, react, vue } from '@zeus-js/web-c'
import zeus, {
  componentLibrary as rolldownComponentLibrary,
} from '@zeus-js/web-c/rolldown'
```

断言导出存在即可。

## 风险与取舍

1. `cancelable` 默认值从 `true` 改为 `false` 是行为变化，需要在 release note 标记。
2. `emit.valueChange()` 是新推荐 API，但字符串 `emit()` 应保留，避免破坏已有组件。
3. `expose()` 的 method 类型 P1 只能粗略生成，完整签名需要 analyzer 解析函数签名，放 P2 更稳。
4. `cssVars` 从数组迁移到 record 会影响 output 测试，建议先做双格式兼容。
5. `@zeus-js/web-c` 聚合包不要反向变成 runtime 依赖入口，否则会混淆“构建工具链”和“组件运行时”的边界。

## 最终验收标准

用下面源码定义 primitive 组件时：

```tsx
import { Host, defineElement, event, prop } from '@zeus-js/zeus'

export const Input = defineElement(
  'zw-input',
  {
    shadow: false,
    props: {
      value: String,
      type: prop(['text', 'password'], {
        default: 'text',
        reflect: true,
      }),
    },
    emits: {
      valueChange: event<{ value: string }>(),
    },
  },
  (_props, { emit, expose }) => {
    expose({
      focus() {},
    })

    return (
      <Host>
        <slot name="prefix" />
        <input part="control" onInput={() => emit.valueChange({ value: '' })} />
      </Host>
    )
  },
)
```

工具链必须生成：

1. lazy loader / auto 只注册 proxy element。
2. 真实组件 connected 后才 import。
3. `value`、`type` prop 的 attribute/property metadata。
4. `value-change` DOM event metadata。
5. React `onValueChange` 类型和 event bridge。
6. Vue `'value-change'` emits 类型。
7. `prefix` slot metadata。
8. `control` css part metadata。
9. `focus()` method metadata 和 lazy proxy。
10. `custom-elements.json`、`zeus.components.json`、WC/JSX/React/Vue d.ts。
