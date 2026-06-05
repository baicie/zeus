下面按 `design/primitive-component-protocol` 分支这两份文档的最终方案，给出一份**可直接拆 PR 落地的详细设计与代码草案**。

这次方案的核心不是重写 Web-C，而是在现有 `packages/web-c/*` 和 `runtime-dom` 基础上补齐 primitive component protocol。文档已经明确目标：组件作者用低心智负担语法定义 Web Component，同时工具链稳定生成 Web Component 注册入口、React/Vue wrapper、`custom-elements.json`、`zeus.components.json`、类型声明和 registry/AI 元数据。

---

# 0. 最终结论

这条分支的方案应按 **P1 协议核心** 落地：

```txt
P1 必做：
1. runtime-dom 增加 prop()、event()、emits、expose()
2. analyzer 提取 props / emits / slots / parts / methods
3. output-wc manifest 增加 events / methods / slots / parts / cssVars
4. web-c-runtime 增加 lazy method proxy
5. React/Vue wrapper 消费规范化事件元数据
6. component-dts 扩展事件、methods、slots、function prop 类型
7. 新增 @zeus-js/web-c 聚合包
```

文档中也把 P1 明确定义为：`defineElement` 支持 `prop()`、`event()`、`emits`、`expose()`，analyzer 提取完整 metadata，manifest 扩展元数据，lazy runtime 支持 method proxy，React/Vue event bridge 消费规范化事件元数据，并新增 `@zeus-js/web-c` 聚合包。

P2 先不要急着做，只保留入口：

```txt
P2 延后：
1. formAssociated + ElementInternals 完整实现
2. detail 类型 AST 精准提取
3. manifest schema 严格校验
4. docs / registry 完整消费
```

文档也是这么拆的。

---

# 1. 当前现状与主要缺口

当前仓库已经具备 Web-C 工具链基础，但缺的是 primitive protocol 的统一入口。文档列出的现状很关键：

| 模块                            | 当前已有                                      | 主要缺口                                                        |
| ------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `@zeus-js/runtime-dom`          | `defineElement`、props bridge、light DOM slot | 缺 `prop()`、`event()`、`emits`、强类型 `emit`、`expose()`      |
| `@zeus-js/component-analyzer`   | 解析 `props`、`meta`、部分 setup metadata     | 缺 `emits`、`event()`、`prop(values)`、`Function`、`ctx.expose` |
| `@zeus-js/output-wc`            | lazy / side-effect 输出、loader、manifest     | lazy manifest 缺 method proxy 元信息，事件元数据不完整          |
| `@zeus-js/web-c-runtime`        | lazy Proxy Element、prop bridge、ready        | 缺 lazy method proxy                                            |
| `@zeus-js/output-react-wrapper` | minimal / event-bridge 雏形                   | event bridge 应消费规范化事件元数据                             |
| `@zeus-js/output-vue-wrapper`   | minimal / event-bridge 雏形                   | Vue emits 应消费 DOM event name                                 |
| `@zeus-js/component-dts`        | WC / JSX / React / Vue d.ts 生成              | 需要扩展事件、methods、slots、function prop 类型                |
| `@zeus-js/web-c`                | 未存在                                        | 需要新增聚合包                                                  |

这些缺口来自 implementation 文档的现状表。

---

# 2. 目标源码形态

最终组件作者写法应该是这样：

```tsx
import { Host, defineElement, event, prop } from '@zeus-js/zeus'

export const Input = defineElement(
  'zw-input',
  {
    shadow: false,

    props: {
      value: String,

      type: prop(['text', 'password', 'email', 'number', 'search'], {
        default: 'text',
        reflect: true,
      }),

      placeholder: {
        type: String,
        default: '',
      },

      disabled: {
        type: Boolean,
        reflect: true,
      },

      readonly: {
        type: Boolean,
        reflect: true,
      },

      required: {
        type: Boolean,
        reflect: true,
      },

      name: String,
    },

    emits: {
      valueChange: event<{
        value: string
        nativeEvent: Event
      }>(),

      focusChange: event<{
        focused: boolean
        nativeEvent: FocusEvent
      }>(),
    },
  },
  (props, { emit, expose }) => {
    let inputEl: HTMLInputElement | undefined

    expose({
      focus() {
        if (inputEl) inputEl.focus()
      },

      blur() {
        if (inputEl) inputEl.blur()
      },

      select() {
        if (inputEl) inputEl.select()
      },
    })

    return (
      <Host data-disabled={() => (props.disabled ? '' : undefined)}>
        <slot name="prefix" />

        <input
          ref={el => {
            inputEl = el
          }}
          value={() => props.value}
          onInput={event => {
            const target = event.currentTarget as HTMLInputElement

            emit.valueChange({
              value: target.value,
              nativeEvent: event,
            })
          }}
        />

        <slot name="suffix" />
      </Host>
    )
  },
)
```

这就是 protocol 文档里的推荐源码形态。它强调：简单 prop 用 `value: String`，有限值用 `prop([...])`，事件用 `emits`，方法从 `expose()` 推导，slot 从 JSX `<slot>` 推导。

---

# 3. 设计原则

落地时必须坚持这几个规则：

```txt
1. 简单写法优先：value: String
2. 默认推导优先：camelCase -> kebab-case
3. JS 用 camelCase，DOM 用 kebab-case
4. 复杂配置才对象化
5. 源码必须可静态分析
6. 运行时行为和生成元数据必须一致
```

这些是协议文档的设计原则。

---

# 4. 第一阶段：扩展 ComponentRecord 契约

路径：

```txt
packages/web-c/component-analyzer/src/types.ts
```

目标：让 analyzer 到所有 output plugin 之间只使用一个共享数据结构。

## 4.1 类型草案

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
   * defineElement({ emits }) 里的 key。
   * example: valueChange
   */
  key: string

  /**
   * DOM CustomEvent 名。
   * example: value-change
   */
  name: string

  /**
   * React wrapper prop 名。
   * example: onValueChange
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

这个结构基本照 implementation 文档里的 Manifest Contract 来。文档明确 `ComponentRecord` 是 analyzer 到所有 output plugin 的共享契约，并建议先扩展 `packages/web-c/component-analyzer/src/types.ts`。

## 4.2 兼容策略

```txt
1. events 仍为 record，key 使用 emits key。
2. 旧 emit('value-change') 作为 fallback 事件来源，不作为推荐协议。
3. cssVars 从 string[] 迁移到 record 时，output 层先兼容数组和 record。
```

这三点也在文档里明确列了，尤其 `cssVars` 双格式兼容很重要，避免一次打爆旧测试。

---

# 5. 第二阶段：runtime-dom 增加 prop / event / emits / expose

路径：

```txt
packages/core/runtime-dom/src/defineElement.ts
packages/core/runtime-dom/src/index.ts
packages/core/zeus/src/index.ts
```

当前 `defineElement.ts` 已有 `ElementPropConstructor`，但只包含 `String / Number / Boolean / Object / Array`，缺 `Function`。

当前 `DefineElementContext` 也只有字符串 `emit`，还没有 `emits` 强类型对象 API 和 `expose()`。

## 5.1 扩展 prop 类型

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

设计点：

```txt
prop(['text', 'password']) 只表达 string literal union
Array 仍表示 JS property 数组类型
Function 默认 attr: false
```

这正是 implementation 文档的 Runtime API 草案。

---

## 5.2 event() API

```ts
export interface EventDefinition<Detail = unknown> {
  __zeusEvent: true
  name?: string
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean

  /**
   * Phantom type only.
   */
  __detail?: Detail
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

export interface EmitsOptions {
  [key: string]: EventDefinition<unknown>
}

const DEFAULT_EVENT_OPTIONS = {
  bubbles: true,
  composed: true,
  cancelable: false,
}
```

注意：当前 runtime 里 `emit` 创建 `CustomEvent` 时 `cancelable` 是 `true`。
协议要求默认改成 `false`，implementation 文档也明确指出这是一个可观察行为变化，必须用测试锁住。

---

## 5.3 DefineElementOptions 增加 emits / slots / parts / cssVars / formAssociated

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

  /**
   * Metadata only in P1.
   */
  slots?: readonly string[]
  parts?: readonly string[]
  cssVars?: Record<string, { description?: string }>

  meta?: DefineElementMeta
}
```

`slots / parts / cssVars` 在 P1 只作为 metadata 入口，runtime 不消费。这个设计来自文档。

---

## 5.4 强类型 emit API + 保留字符串 API

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

文档要求保留旧字符串 API，同时推荐 `emit.valueChange(detail)`。
风险章节也强调：`emit.valueChange()` 是新推荐 API，但字符串 `emit()` 应保留，避免破坏已有组件。

---

## 5.5 createEmitApi 实现

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

function resolveEventName(
  name: string,
  emits: EmitsOptions | undefined,
): string {
  if (!emits) return name

  const definition = emits[name]

  if (definition) {
    return definition.name || toKebabCase(name)
  }

  return name
}

function resolveEventOptions(
  name: string,
  emits: EmitsOptions | undefined,
  options: CustomEventInit | undefined,
): Required<Pick<CustomEventInit, 'bubbles' | 'composed' | 'cancelable'>> {
  const definition = emits && emits[name]

  return {
    bubbles:
      options && options.bubbles !== undefined
        ? options.bubbles
        : definition && definition.bubbles !== undefined
          ? definition.bubbles
          : DEFAULT_EVENT_OPTIONS.bubbles,

    composed:
      options && options.composed !== undefined
        ? options.composed
        : definition && definition.composed !== undefined
          ? definition.composed
          : DEFAULT_EVENT_OPTIONS.composed,

    cancelable:
      options && options.cancelable !== undefined
        ? options.cancelable
        : definition && definition.cancelable !== undefined
          ? definition.cancelable
          : DEFAULT_EVENT_OPTIONS.cancelable,
  }
}
```

行为：

```ts
emit.valueChange({ value: 'a' })
// dispatch CustomEvent('value-change')

emit('value-change', { value: 'a' })
// 兼容旧行为，原样派发 value-change

event('input-value-change')
// 自定义 DOM event name；React prop 仍来自 emits key，例如 onValueChange
```

文档要求 `resolveEventName('valueChange')` 优先读取 `emits.valueChange.name`，否则推导为 `value-change`；如果用户传旧的 `'value-change'` 字符串且 `emits` 中没有该 key，则原样派发。

---

## 5.6 expose() 实现

P1 推荐简单方案：`expose()` 直接把方法写到 host 上。

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

然后在 `connectedCallback()` 和 `mountElementDefinition()` 中都使用：

```ts
const setupContext: DefineElementContext<E, EmitterOptions> = {
  host: this as unknown as E,
  emit: createEmitApi(this, options.emits) as EmitApi<EmitterOptions>,
  expose: createExpose(this),
}
```

lazy 场景下，真实组件加载后 `expose()` 会把方法挂到同一个 host 上。文档也建议 P1 用这个简单方案，不必先引入 `callMethod()`。

---

## 5.7 index 导出

路径：

```txt
packages/core/runtime-dom/src/index.ts
packages/core/zeus/src/index.ts
```

当前 `runtime-dom/src/index.ts` 已经导出 `defineElement` 等类型。

新增导出：

```ts
export {
  defineElement,
  getElementDefinition,
  mountElementDefinition,
  prop,
  event,
  ZEUS_ELEMENT_DEFINITION,
  type DefineElementOptions,
  type DefineElementMeta,
  type DefineElementContext,
  type DefineElementSetup,
  type ElementPropConstructor,
  type PropDefinition,
  type PropDefinitionOptions,
  type ValuePropDefinition,
  type EventDefinition,
  type EventOptions,
  type EmitsOptions,
  type EmitApi,
  type EmitFunction,
  type PropOptions,
  type MountedElementDefinition,
  type ElementDefinitionMountState,
  type NormalizedPropDefinition,
  type ZeusElementConstructor,
  type ZeusElementDefinition,
} from './defineElement'
```

`@zeus-js/zeus` 也要 re-export：

```ts
export { defineElement, event, prop, Host } from '@zeus-js/runtime-dom'
```

文档明确要求 `@zeus-js/zeus` 从 `runtime-dom` 导出 `defineElement`、`event`、`prop`、`Host`。

---

# 6. 第三阶段：Analyzer 实现

Analyzer 是这次改动核心。文档明确说：所有 output 都应消费 analyzer 结果，不重新猜测源码。

---

## 6.1 Props：支持 Function、prop(values)、values

路径：

```txt
packages/web-c/component-analyzer/src/extractProps.ts
```

要做：

```txt
1. isPropConstructorName() 增加 Function
2. typeFromConstructorName() 增加 function
3. 支持 prop([...], options)
4. 支持对象写法 values
5. Function / Object / Array 默认 attr: false
```

代码草案：

```ts
function isPropConstructorName(name: string): boolean {
  return (
    name === 'String' ||
    name === 'Number' ||
    name === 'Boolean' ||
    name === 'Object' ||
    name === 'Array' ||
    name === 'Function'
  )
}

function typeFromConstructorName(name: string): ComponentPropType {
  if (name === 'String') return 'string'
  if (name === 'Number') return 'number'
  if (name === 'Boolean') return 'boolean'
  if (name === 'Object') return 'object'
  if (name === 'Array') return 'array'
  if (name === 'Function') return 'function'

  return 'unknown'
}

function extractRuntimeProp(node: t.Expression | t.PatternLike): ComponentProp {
  if (t.isIdentifier(node)) {
    const type = typeFromConstructorName(node.name)

    return normalizeAttributeBackedProp({
      type,
    })
  }

  if (isPropCall(node)) {
    return extractPropCall(node)
  }

  if (t.isObjectExpression(node)) {
    return normalizeAttributeBackedProp(extractPropOptions(node))
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

  return normalizeAttributeBackedProp(prop)
}

function normalizeAttributeBackedProp(prop: ComponentProp): ComponentProp {
  if (
    prop.attr === undefined &&
    (prop.type === 'object' ||
      prop.type === 'array' ||
      prop.type === 'function')
  ) {
    prop.attr = false
  }

  return prop
}
```

文档里的 props analyzer 要求包括 `Function`、`prop([...], options)`、对象写法 `values`、以及 `Function` prop 默认非 attribute-backed。

---

## 6.2 Emits：新增 extractEmits.ts

路径：

```txt
packages/web-c/component-analyzer/src/extractEmits.ts
```

目标输入：

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
import * as t from '@babel/types'

import type { ComponentEvent } from './types'

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

    events[key] = extractEventDefinition(key, member.value)
  }

  return events
}

function extractEventDefinition(
  key: string,
  node: t.Expression | t.PatternLike,
): ComponentEvent {
  const defaults: ComponentEvent = {
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
    const eventName = first.value

    return {
      key,
      name: eventName,
      reactName: defaults.reactName,
      bubbles: defaults.bubbles,
      composed: defaults.composed,
      cancelable: defaults.cancelable,
    }
  }

  if (t.isObjectExpression(first)) {
    const eventName = readStaticString(first, 'name') || defaults.name

    return {
      key,
      name: eventName,
      reactName: defaults.reactName,
      bubbles: readStaticBoolean(first, 'bubbles', defaults.bubbles),
      composed: readStaticBoolean(first, 'composed', defaults.composed),
      cancelable: readStaticBoolean(first, 'cancelable', defaults.cancelable),
    }
  }

  return defaults
}
```

文档里的 `extractEmits` 草案就是这个方向，而且强调实际实现里按项目规则调整对象展开。

---

## 6.3 Setup metadata：slots / parts / expose / fallback events

路径：

```txt
packages/web-c/component-analyzer/src/extractSetup.ts
```

目标：

```txt
1. slot 同时识别 <slot> 和 <Slot>
2. css parts 识别静态 part=""，支持空格拆分
3. methods 从 expose({ focus() {} })、ctx.expose({}) 提取
4. events fallback 识别 emit('value-change')、ctx.emit('value-change')、emit.valueChange(...)
```

类型：

```ts
export interface SetupMeta {
  events: Record<string, ComponentEvent>
  methods: Record<string, ComponentMethod>
  slots: Record<string, ComponentSlot>
  hostAttributes: string[]
  cssParts: string[]
}
```

slot 提取：

```ts
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
```

part 提取：

```ts
function extractPart(node: t.Node, cssParts: Set<string>): void {
  if (!t.isJSXElement(node)) return

  const rawPart = getJSXStringAttribute(node, 'part')
  if (!rawPart) return

  for (const part of rawPart.split(/\s+/)) {
    if (part) cssParts.add(part)
  }
}
```

expose 提取：

```ts
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

function isExposeCallee(
  callee: t.Expression | t.V8IntrinsicIdentifier,
): boolean {
  if (t.isIdentifier(callee, { name: 'expose' })) return true

  return (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.property, { name: 'expose' })
  )
}
```

文档对 setup metadata 的要求包含 slot、part、expose、fallback events，并明确 `extractDefineElement.ts` 要负责合并各来源。

---

## 6.4 extractDefineElement 合并规则

路径：

```txt
packages/web-c/component-analyzer/src/extractDefineElement.ts
```

合并规则：

```ts
const runtimeProps = extractProps(options)
const declaredEvents = extractEmits(options)
const setupMeta = extractSetup(setup)

return {
  tag,
  name,
  exportName,
  source,

  props: runtimeProps,
  runtimeProps,

  events: mergeEvents(declaredEvents, setupMeta.events),
  methods: mergeMethods(extractExplicitMethods(options), setupMeta.methods),
  slots: mergeSlots(setupMeta.slots, extractExplicitSlots(options)),
  cssParts: mergeStringList(setupMeta.cssParts, extractExplicitParts(options)),
  cssVars: mergeCssVars(
    extractCssVars(options),
    extractLegacyMetaCssVars(options),
  ),

  hostAttributes: setupMeta.hostAttributes,

  meta: {
    shadow: extractShadow(options),
    formAssociated: extractFormAssociated(options),
  },
}
```

优先级：

```txt
events: emits 优先，setup fallback 补充
slots: JSX slot + options.slots 合并
cssParts: JSX part + options.parts 合并
cssVars: options.cssVars + meta.cssVars 兼容合并
methods: setup expose 为主
shadow / formAssociated: 来自 options
```

这套合并规则来自 implementation 文档。

---

# 7. 第四阶段：Output WC

路径：

```txt
packages/web-c/output-wc/src/generateLazyManifest.ts
packages/web-c/output-wc/src/generateCustomElementsJson.ts
packages/web-c/output-wc/src/generateZeusComponentsJson.ts
```

---

## 7.1 Lazy manifest 增加 methods

生成结果：

```ts
export const components = [
  {
    tagName: 'zw-input',
    shadow: false,
    load: () => import('./zw-input.entry.js'),
    props: [
      {
        name: 'value',
        attrName: 'value',
        type: 'string',
      },
      {
        name: 'type',
        attrName: 'type',
        type: 'string',
        reflect: true,
        default: 'text',
      },
      {
        name: 'formatter',
        attrName: false,
        type: 'function',
      },
    ],
    methods: ['focus'],
  },
]
```

generator 草案：

```ts
function generateLazyComponentRecord(component: ComponentRecord): string {
  const props = generatePropsArray(component)
  const methods = Object.keys(component.methods || {})

  const lines = [
    '  {',
    `    tagName: ${JSON.stringify(component.tag)},`,
    `    shadow: ${component.meta && component.meta.shadow === true ? 'true' : 'false'},`,
    `    load: () => import(${JSON.stringify(createEntryImportPath(component))}),`,
    `    props: ${props},`,
  ]

  if (methods.length > 0) {
    lines.push(`    methods: ${JSON.stringify(methods)},`)
  }

  lines.push('  }')

  return lines.join('\n')
}

function isAttributeBackedType(type: ComponentProp['type']): boolean {
  return type === 'string' || type === 'number' || type === 'boolean'
}

function resolveAttrName(name: string, prop: ComponentProp): string | false {
  if (prop.attr !== undefined) return prop.attr

  if (!isAttributeBackedType(prop.type)) return false

  return toKebabCase(name)
}
```

文档要求 lazy manifest 增加 `methods`，并且 `function/object/array` 默认输出 `attrName: false`。

---

## 7.2 custom-elements.json

输出需要消费新字段：

```txt
1. events 使用 event.name 作为 DOM event name
2. members 包含 exposed methods
3. slots 使用 slot.name
4. cssParts / cssVars 输出公共样式 API
5. attributes 只包含 attribute-backed props
```

草案：

```ts
function generateCustomElementsJson(components: ComponentRecord[]): string {
  return JSON.stringify(
    {
      schemaVersion: '1.0.0',
      modules: components.map(component => {
        return {
          kind: 'javascript-module',
          path: component.source,
          declarations: [
            {
              kind: 'class',
              customElement: true,
              name: component.exportName,
              tagName: component.tag,

              members: [
                ...Object.keys(component.props).map(name => {
                  const prop = component.props[name]

                  return {
                    kind: 'field',
                    name,
                    type: {
                      text: propToTsType(prop),
                    },
                  }
                }),

                ...Object.keys(component.methods).map(name => {
                  return {
                    kind: 'method',
                    name,
                  }
                }),
              ],

              attributes: Object.keys(component.props)
                .map(name => {
                  const prop = component.props[name]
                  const attr = resolveAttrName(name, prop)

                  if (attr === false) return undefined

                  return {
                    name: attr,
                    fieldName: name,
                    type: {
                      text: propToTsType(prop),
                    },
                  }
                })
                .filter(Boolean),

              events: Object.keys(component.events).map(key => {
                const event = component.events[key]

                return {
                  name: event.name,
                  type: {
                    text: `CustomEvent<${eventDetailToTs(event)}>`,
                  },
                }
              }),

              slots: Object.keys(component.slots).map(name => {
                return {
                  name,
                }
              }),

              cssParts: component.cssParts.map(name => {
                return {
                  name,
                }
              }),

              cssProperties: Object.keys(component.cssVars).map(name => {
                const variable = component.cssVars[name]

                return {
                  name,
                  description: variable.description,
                }
              }),
            },
          ],
        }
      }),
    },
    null,
    2,
  )
}
```

文档要求 custom-elements.json 消费这些新字段。

---

## 7.3 zeus.components.json

建议完整输出协议：

```json
{
  "version": 1,
  "components": [
    {
      "tag": "zw-input",
      "name": "Input",
      "props": {
        "value": {
          "type": "string",
          "attr": "value",
          "reflect": false
        }
      },
      "events": {
        "valueChange": {
          "name": "value-change",
          "reactName": "onValueChange",
          "bubbles": true,
          "composed": true,
          "cancelable": false
        }
      },
      "methods": {
        "focus": {
          "name": "focus"
        }
      },
      "slots": {
        "prefix": {
          "name": "prefix"
        }
      },
      "cssParts": ["control"],
      "cssVars": {},
      "shadow": false,
      "formAssociated": false
    }
  ]
}
```

文档建议 `zeus.components.json` 输出完整协议，供 registry、docs、AI 消费。

---

# 8. 第五阶段：web-c-runtime lazy method proxy

路径：

```txt
packages/web-c/web-c-runtime/src/types.ts
packages/web-c/web-c-runtime/src/lazy-element.ts
```

## 8.1 扩展 ZeusLazyComponentMeta

```ts
export interface ZeusLazyComponentMeta {
  tagName: string
  load: () => Promise<ZeusComponentModule | { default: ZeusComponentModule }>
  props: ZeusPropMeta[]
  methods?: string[]
  shadow?: boolean
}
```

文档明确要求 `ZeusLazyComponentMeta` 增加 `methods?: string[]`。

---

## 8.2 安装 method proxy

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

      value: function (): Promise<unknown> {
        const host = this as HTMLElement
        const args = Array.prototype.slice.call(arguments)
        const hostRef = requireHostRef(host)

        return waitForComponentReady(hostRef).then(readyHost => {
          const method = (readyHost as HTMLElement & Record<string, unknown>)[
            name
          ]

          if (typeof method !== 'function') {
            throw new Error(
              `[zeus:web-c] Method "${name}" is not exposed on <${hostRef.meta.tagName}>.`,
            )
          }

          return method.apply(readyHost, args)
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

文档中这部分已经给出草案，并提醒当前 ES2016 约束不推荐 rest/spread，实际实现可用 `Array.prototype.slice.call(arguments)`。

---

# 9. 第六阶段：React wrapper 消费规范事件元数据

路径：

```txt
packages/web-c/output-react-wrapper/src/*
```

目标：

```txt
component.events[key].name      -> DOM event name
component.events[key].reactName -> React prop name
```

## 9.1 Event bindings

```ts
interface EventBinding {
  eventName: string
  sourceName: string
  localName: string
}

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

文档里要求 React wrapper 的 event bridge 改为消费新事件 metadata。

## 9.2 生成代码形态

```tsx
import * as React from 'react'

export const Input = React.forwardRef(function Input(inputProps, forwardedRef) {
  const props = inputProps || {}
  const children = props.children
  const onValueChange = props.onValueChange
  const rest = omitProps(props, ['children', 'onValueChange'])
  const innerRef = React.useRef(null)

  React.useImperativeHandle(forwardedRef, function () {
    return innerRef.current
  })

  React.useEffect(
    function () {
      const el = innerRef.current

      if (!el || !onValueChange) return undefined

      const handler = function (event) {
        onValueChange(event)
      }

      el.addEventListener('value-change', handler)

      return function () {
        el.removeEventListener('value-change', handler)
      }
    },
    [onValueChange],
  )

  return React.createElement(
    'zw-input',
    Object.assign({}, rest, {
      ref: innerRef,
    }),
    children,
  )
})
```

验收点：

```txt
1. onValueChange 不进入 rest
2. mount 绑定 listener
3. handler 变化时解绑旧 listener
4. unmount 清理 listener
5. ref 指向底层 custom element
```

文档明确列了这些验收点。

---

# 10. 第七阶段：Vue wrapper 消费 DOM event name

路径：

```txt
packages/web-c/output-vue-wrapper/src/*
```

目标：

```ts
const eventNames = Object.keys(component.events).map(key => {
  return component.events[key].name
})
```

生成形态：

```ts
import { defineComponent, h } from 'vue'

export const Input = defineComponent({
  name: 'Input',
  inheritAttrs: false,

  props: {
    value: String,
    type: String,
    disabled: Boolean,
  },

  emits: ['value-change', 'focus-change'],

  setup(props, { attrs, slots }) {
    return () =>
      h(
        'zw-input',
        Object.assign({}, attrs, props),
        slots.default ? slots.default() : undefined,
      )
  },
})
```

类型里：

```ts
{
  'value-change': (event: CustomEvent<{ value: string }>) => void
}
```

文档要求 Vue wrapper 使用 kebab-case DOM event name。

---

# 11. 第八阶段：component-dts 扩展

路径：

```txt
packages/web-c/component-dts/src/*
```

需要生成：

```txt
1. WC element interface 包含 props 和 exposed methods
2. JSX IntrinsicElements 包含 props 和 event handler
3. React props 包含 onValueChange
4. Vue emits 使用 DOM event name
5. function prop 映射为 Function 或 callable 类型
```

文档要求 P1 method 类型可以先输出粗略签名，P2 再从源码签名精化。

## 11.1 DOM Element d.ts 草案

```ts
export interface ZwInputValueChangeEventDetail {
  value: string
}

export interface ZwInputElement extends HTMLElement {
  value?: string
  type?: 'text' | 'password'
  formatter?: Function

  focus(): Promise<unknown> | unknown

  addEventListener(
    type: 'value-change',
    listener: (event: CustomEvent<ZwInputValueChangeEventDetail>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void

  removeEventListener(
    type: 'value-change',
    listener: (event: CustomEvent<ZwInputValueChangeEventDetail>) => void,
    options?: boolean | EventListenerOptions,
  ): void
}

declare global {
  interface HTMLElementTagNameMap {
    'zw-input': ZwInputElement
  }
}
```

## 11.2 JSX d.ts 草案

```ts
export interface ZwInputJSXProps {
  value?: string
  type?: 'text' | 'password'
  disabled?: boolean
  formatter?: Function

  onValueChange?: (event: CustomEvent<ZwInputValueChangeEventDetail>) => void

  children?: unknown
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'zw-input': ZwInputJSXProps
    }
  }
}
```

## 11.3 React wrapper d.ts 草案

```ts
import type * as React from 'react'
import type {
  ZwInputElement,
  ZwInputValueChangeEventDetail,
} from '@scope/components/wc/types'

export interface InputProps extends Omit<
  React.HTMLAttributes<ZwInputElement>,
  'onChange' | 'onInput'
> {
  value?: string
  type?: 'text' | 'password'
  disabled?: boolean

  onValueChange?: (event: CustomEvent<ZwInputValueChangeEventDetail>) => void
}

export const Input: React.ForwardRefExoticComponent<
  InputProps & React.RefAttributes<ZwInputElement>
>
```

---

# 12. 第九阶段：新增 `@zeus-js/web-c` 聚合包

路径：

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

文档明确要求新增 `@zeus-js/web-c` 聚合包，并列了目录结构与 package 草案。

## 12.1 src/index.ts

```ts
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

## 12.2 src/rolldown.ts

```ts
export { default, zeus } from '@zeus-js/bundler-plugin/rolldown'
export { componentLibrary } from '@zeus-js/preset-component-library'
export * from './index'
```

`vite.ts` 和 `rollup.ts` 同理。

注意：如果 package 保持 `"type": "module"`，不要随便加 `module.exports` CJS 入口。根入口应保持 ESM 转发；如果后续确实需要 CommonJS，应单独提供 `.cjs` 文件和独立 exports 条件。

---

# 13. 推荐 PR 拆分顺序

文档给出的实现顺序很合理，我建议按它拆 PR：

```txt
PR 1: 扩展 ComponentRecord 类型，并让 output 层兼容新旧字段
PR 2: runtime-dom 增加 prop() / event() / emits / expose()
PR 3: analyzer 增加 props / emits / setup metadata 提取
PR 4: output-wc lazy manifest 增加 methods，web-c-runtime 增加 method proxy
PR 5: React/Vue wrapper 消费 event.name / event.reactName
PR 6: component-dts 扩展事件和 methods 类型
PR 7: 新增 @zeus-js/web-c 聚合包
PR 8: 更新 docs/internal/packages.md
```

这是 implementation 文档的推荐顺序。

---

# 14. 测试设计

## 14.1 runtime 测试

路径：

```txt
packages/core/runtime-dom/__tests__/defineElement.props.spec.tsx
packages/core/runtime-dom/__tests__/defineElement.spec.tsx
```

场景：

```txt
1. prop(['a', 'b'], { default: 'a' }) 默认值可读
2. Function prop 不通过 attribute 同步
3. event() 默认派发 bubbles: true / composed: true / cancelable: false
4. emit.valueChange(detail) 派发 value-change
5. event('custom-name') 派发 custom-name
6. expose({ focus }) 后 host.focus() 可调用
```

测试草案：

```ts
it('dispatches declared event with default options', () => {
  const El = defineElement(
    'zw-event-test',
    {
      emits: {
        valueChange: event<{ value: string }>(),
      },
    },
    (_props, { emit }) => {
      return (
        <button
          onClick={() => {
            emit.valueChange({ value: 'hello' })
          }}
        />
      )
    },
  )

  const el = document.createElement('zw-event-test')
  const events: CustomEvent[] = []

  el.addEventListener('value-change', event => {
    events.push(event as CustomEvent)
  })

  document.body.appendChild(el)
  el.querySelector('button')?.click()

  expect(events).toHaveLength(1)
  expect(events[0].detail).toEqual({ value: 'hello' })
  expect(events[0].bubbles).toBe(true)
  expect(events[0].composed).toBe(true)
  expect(events[0].cancelable).toBe(false)
})
```

文档已列出 runtime 验收项。

---

## 14.2 analyzer fixture 测试

fixture：

```tsx
defineElement(
  'zw-input',
  {
    shadow: false,
    props: {
      value: String,
      type: prop(['text', 'password'], {
        default: 'text',
        reflect: true,
      }),
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

```txt
1. props.type.values === ['text', 'password']
2. props.formatter.type === 'function'
3. events.valueChange.name === 'value-change'
4. events.valueChange.reactName === 'onValueChange'
5. methods.focus 存在
6. slots.prefix 存在
7. cssParts 包含 control
8. meta.shadow === false
```

这些断言来自文档。

---

## 14.3 output 测试

```txt
1. lazy manifest 包含 methods: ['focus']
2. custom-elements.json 包含 event / method / slot / css part
3. React event bridge 生成 addEventListener('value-change', ...)
4. React wrapper 不透传 onValueChange
5. Vue wrapper emits 包含 'value-change'
6. WC JSX d.ts 能识别 <zw-input value="x" />
```

文档也列了这些 output 验收项。

---

## 14.4 聚合包 smoke test

```ts
import { componentLibrary, wc, react, vue } from '@zeus-js/web-c'

import zeus, {
  componentLibrary as rolldownComponentLibrary,
} from '@zeus-js/web-c/rolldown'

expect(componentLibrary).toBeTruthy()
expect(wc).toBeTruthy()
expect(react).toBeTruthy()
expect(vue).toBeTruthy()
expect(zeus).toBeTruthy()
expect(rolldownComponentLibrary).toBeTruthy()
```

文档要求新增聚合包导出存在性测试。

---

# 15. 最终验收标准

最终用下面源码：

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

```txt
1. lazy loader / auto 只注册 proxy element
2. 真实组件 connected 后才 import
3. value / type prop attribute-property metadata
4. value-change DOM event metadata
5. React onValueChange 类型和 event bridge
6. Vue 'value-change' emits 类型
7. prefix slot metadata
8. control css part metadata
9. focus() method metadata 和 lazy proxy
10. custom-elements.json、zeus.components.json、WC/JSX/React/Vue d.ts
```

这就是分支文档最后给出的最终验收标准。

---

# 16. 最推荐的 PR title

```txt
feat(web-c): add primitive component protocol
```

更细一点可以拆成：

```txt
feat(runtime-dom): add primitive prop event and expose APIs
feat(component-analyzer): extract primitive emits methods slots and parts
feat(output-wc): emit primitive metadata and lazy method proxies
feat(web-c-runtime): add lazy method proxy support
feat(output-react-wrapper): bridge primitive custom events
feat(output-vue-wrapper): generate primitive emits metadata
feat(component-dts): generate primitive events and methods types
feat(web-c): add aggregate component toolchain package
```

一句话总结：**这条分支最终方案的正确落点，是把 `props / emits / expose / slot / part` 变成单一事实来源，然后让 analyzer 生成统一 `ComponentRecord`，所有 output 只消费这个 record，不再各自猜组件 API。**
