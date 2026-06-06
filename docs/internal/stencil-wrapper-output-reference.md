# Stencil Wrapper Output Reference

本文基于 `examples/stencil-wrapper` 的 Stencil demo，梳理 Stencil 如何把组件的 props、attributes、events、slots、methods/expose、state/watch、style metadata 编译到 Web Components、类型文件、React wrapper 与 Vue wrapper 中，并给 Zeus 的 Web-C / wrapper 产物提出参考建议。

参考资料：

- Stencil Properties: https://stenciljs.com/docs/properties
- Stencil Events: https://stenciljs.com/docs/events
- Stencil Methods: https://stenciljs.com/docs/methods
- Stencil Output Targets: https://stenciljs.com/docs/output-targets
- Stencil React Integration: https://stenciljs.jp/docs/react
- Stencil Vue Integration: https://stenciljs.com/docs/vue
- Stencil Component Lifecycle: https://stenciljs.com/docs/component-lifecycle
- Stencil Form-Associated Components: https://stenciljs.com/docs/form-associated
- Stencil Attach Internals: https://stenciljs.com/docs/attach-internals
- Stencil Serialization: https://stenciljs.com/docs/serialization
- Stencil Styling: https://stenciljs.com/docs/styling
- Stencil Host Element: https://stenciljs.com/docs/host-element

## Demo 覆盖面

本次 demo 位于 `examples/stencil-wrapper`。

组件源码：

- `src/components/z-demo-button/z-demo-button.tsx`
- `src/components/z-demo-input/z-demo-input.tsx`

Stencil 配置：

- `stencil.config.ts`

生成产物：

- Web Components: `dist/components/*.js`
- Lazy loader/runtime: `dist/esm`, `dist/cjs`, `loader`
- React wrapper: `src/generated/react/components.ts`
- Vue wrapper: `src/generated/vue/components.ts`
- 类型入口: `src/components.d.ts`, `dist/types/index.d.ts`
- metadata: `src/generated/custom-elements.json`

`z-demo-input` 当前覆盖：

| 能力                    | Stencil 写法                                            | 产物观察                                                                    |
| ----------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| string prop             | `@Prop() placeholder?: string`                          | `type: "string"`，attribute 为 `placeholder`                                |
| boolean reflected prop  | `@Prop({ reflect: true }) disabled = false`             | attribute/property 双向入口，runtime flag 为 boolean + reflect              |
| number attr name        | `@Prop({ attribute: 'max-length' }) maxLength?: number` | attribute 为 `max-length`，TS/JS property 为 `maxLength`                    |
| function prop           | `@Prop() formatter?: (value: string) => string`         | `type: "unknown"`，wrapper 当 property 传递                                 |
| object prop             | `@Prop() meta?: DemoInputMeta`                          | `type: "unknown"`，HTML attribute 不负责 JSON 反序列化                      |
| mutable reflected value | `@Prop({ mutable: true, reflect: true }) value = ''`    | 组件内部可写，attribute 反射                                                |
| event                   | `@Event({ eventName: 'value-change' })`                 | DOM `CustomEvent`，React/Vue wrapper 显式映射                               |
| named slots             | `<slot name="prefix" />` 等                             | DOM slot 原样输出，docs-json 从 `@slot` JSDoc 记录                          |
| parts                   | `part="control"` 等                                     | DOM part 原样输出，docs-json 从 `@part` JSDoc 记录                          |
| css vars                | CSS 中 `@prop --z-demo-input-border`                    | docs-json `styles` 记录 CSS custom properties                               |
| public methods          | `@Method() async focusControl()`                        | 类型文件暴露到 element instance；runtime flag 为 method                     |
| internal state          | `@State() focused = false`                              | collection metadata 有 `states`，wrapper 不暴露                             |
| watcher                 | `@Watch('invalid')`                                     | collection/runtime metadata 有 watcher，wrapper 不暴露                      |
| host element            | `@Element() host`                                       | custom-elements 输出里可见 host getter，不作为 public wrapper prop          |
| Vue v-model             | `componentModels`                                       | Vue wrapper 调用 `defineContainer(..., 'value', 'value-change', undefined)` |

## Stencil 构建层级

Stencil 不是只生成一个文件。它把同一个组件拆到几个目的不同的产物：

1. `dist/components/*.js`

   Custom Elements bundle。适合直接 import 单个 custom element。React/Vue wrapper 在本 demo 中都引用这里的 `defineCustomElement`。

2. `dist/collection/components/*/*.js`

   保留较完整的 compiler metadata，例如 `static get properties()`、`events()`、`methods()`、`states()`、`watchers()`。这更像给工具链继续消费的结构化描述。

3. `dist/esm` / `dist/cjs` / `loader`

   lazy-loaded distribution。这里会有 Stencil runtime、`bootstrapLazy` 和压缩后的 component member flags。

4. `src/components.d.ts` / `dist/types`

   public element typing。这里能看到 `Components.ZDemoInput`、`HTMLZDemoInputElementEventMap`、JSX intrinsic element typing、methods、events。

5. `src/generated/react/components.ts`

   React wrapper。它不重新实现组件，只调用 Stencil React runtime 的 `createComponent`。

6. `src/generated/vue/components.ts`

   Vue wrapper。它不重新实现组件，只调用 Stencil Vue runtime 的 `defineContainer`。

7. `src/generated/custom-elements.json`

   文档/设计系统 metadata。props、events、methods、slots、parts、styles 都会进入 JSON。

## Props 与 Attributes

Stencil 的核心规则：

- `@Prop()` 是组件对外属性。
- string/number/boolean 可以从 HTML attribute 进入。
- object/array/function 需要通过 JavaScript property 传入，Stencil 不尝试从 HTML attribute 解析 JSON 或函数。
- `reflect: true` 会把 property 状态反射到 attribute。
- `mutable: true` 允许组件内部修改 prop。
- camelCase property 可映射到 dash-case attribute，例如 `maxLength` 对应 `max-length`。

在 `dist/collection/components/z-demo-input/z-demo-input.js` 中，`static get properties()` 保留完整 metadata：

```ts
disabled: {
  type: 'boolean',
  reflect: true,
  attribute: 'disabled',
}
maxLength: {
  type: 'number',
  attribute: 'max-length',
}
formatter: {
  type: 'unknown',
}
meta: {
  type: 'unknown',
}
value: {
  type: 'string',
  mutable: true,
  reflect: true,
  attribute: 'value',
}
```

在 `dist/components/z-demo-input.js` 中，Stencil 把 member metadata 压缩成 flag table：

```js
{
  disabled: [516],
  formatter: [16],
  invalid: [516],
  maxLength: [2, 'max-length'],
  meta: [16],
  placeholder: [1],
  value: [1537],
  focused: [32],
  focusControl: [64],
}
```

这些数字是 Stencil runtime 的内部编码。可以观察含义，但不应作为外部契约依赖。可从当前产物推断：

- `1` 类似 string prop。
- `2` 类似 number prop。
- `16` 类似 unknown/any/object/function property。
- `32` 类似 internal state。
- `64` 类似 method。
- `516` 是 boolean + reflect 组合。
- `1537` 是 string + mutable + reflect 组合。

## Events / Emits

Stencil 事件是 DOM `CustomEvent`。`@Event()` 生成 `EventEmitter`，运行时通过 `createEvent(...)` 创建 emitter，调用 `.emit(detail)` 后派发 DOM event。

源码：

```ts
@Event({ eventName: 'value-change' })
valueChange!: EventEmitter<{ value: string; nativeEvent: Event }>
```

custom element 产物：

```js
this.valueChange = createEvent(this, 'value-change')
this.valueChange.emit({ value: this.value, nativeEvent })
```

类型产物：

```ts
interface HTMLZDemoInputElementEventMap {
  'value-change': { value: string; nativeEvent: Event }
  'focus-change': { focused: boolean; nativeEvent: FocusEvent }
}
```

React wrapper：

```ts
events: {
  onValueChange: 'value-change',
  onFocusChange: 'focus-change',
}
```

Vue wrapper：

```ts
defineContainer(
  'z-demo-input',
  defineZDemoInput,
  [
    'disabled',
    'formatter',
    'invalid',
    'maxLength',
    'meta',
    'placeholder',
    'value',
    'value-change',
    'focus-change',
  ],
  ['value-change', 'focus-change'],
)
```

这里有一个重要分层：

- Web Component 只关心 DOM event name。
- React wrapper 把 DOM event name 映射成 React 风格 prop：`onValueChange`。
- Vue wrapper 保留 kebab-case event：`@value-change`。

## Vue v-model

Stencil Vue output target 通过 `componentModels` 配置 v-model：

```ts
vueOutputTarget({
  componentModels: [
    {
      elements: ['z-demo-input'],
      event: 'value-change',
      targetAttr: 'value',
    },
  ],
})
```

生成结果：

```ts
defineContainer<JSX.ZDemoInput, JSX.ZDemoInput['value']>(
  'z-demo-input',
  defineZDemoInput,
  [...propsAndEvents],
  ['value-change', 'focus-change'],
  'value',
  'value-change',
  undefined,
)
```

也就是说，Vue wrapper 层知道：

- v-model 绑定到 `value`
- 更新事件是 `value-change`
- 未显式配置 `eventAttr` 时，runtime 使用默认读取策略

Zeus 可以借鉴这一点：组件 metadata 中应有 model 配置，而不是让 Vue output target 猜测 `value`/`change`。

## Slots

Stencil slot 本质是原生 Web Components slot：

```tsx
<slot name="prefix" />
<slot name="suffix" />
<slot name="message">{this.meta?.description}</slot>
```

运行产物保留 `<slot name="...">`。docs-json 的 slots 来自组件 JSDoc：

```ts
/**
 * @slot prefix - Content rendered before the native input.
 * @slot suffix - Content rendered after the native input.
 * @slot message - Helper or validation message below the control.
 */
```

React/Vue wrapper 生成文件没有像 Zeus wrapper 那样显式生成 named slot prop。Stencil wrapper 更依赖框架 runtime 与用户直接传 `slot` attribute / Vue slot 内容。

这和 Zeus 当前 headless wrapper 的方向不同：Zeus React wrapper 已经把 named slot 映射成 props，例如 `prefix`, `suffix`, `message`。这个更贴近 React 用户习惯，也更适合 headless 组件库。

## Methods / Expose

Stencil 用 `@Method()` 暴露 public methods。官方文档要求 public method 返回 Promise 或 async。

源码：

```ts
@Method()
async focusControl() {
  this.control?.focus()
}
```

类型产物：

```ts
interface Components.ZDemoInput {
  focusControl: () => Promise<void>
  selectControl: () => Promise<void>
  setValue: (value: string) => Promise<void>
}
```

custom elements 产物 flag：

```js
focusControl: [64]
selectControl: [64]
setValue: [64]
```

React wrapper 的 `StencilReactComponent` 类型保留 element class，调用方可通过 ref 访问这些 methods。Vue wrapper 没有在生成文件里显式展开 method，但 wrapper runtime 返回的是 custom element container，方法依然在底层 element instance 上。

Zeus 当前 `defineElement` 的 `ctx.expose(...)` 和 Stencil `@Method()` 是同一类概念。区别是：

- Stencil 强制 public methods async。
- Zeus 当前 expose 可以是 sync。

建议 Zeus 对 wrapper metadata 采用更明确的 method schema，是否强制 async 可另行决定。

## Internal State / Watch

Stencil `@State()` 是内部响应式状态，不进入 public props。

源码：

```ts
@State() focused = false
```

collection metadata 有：

```ts
static get states() {
  return { focused: {} }
}
```

custom element compact metadata 有：

```js
focused: [32]
```

React/Vue wrapper 不暴露 `focused`。

`@Watch('invalid')` 进入 watchers metadata：

```ts
static get watchers() {
  return {
    invalid: [{ methodName: 'invalidChanged' }]
  }
}
```

custom element compact metadata 也带 watcher table。wrapper 不需要知道 watcher，它属于组件内部 runtime 行为。

Zeus 参考点：wrapper metadata 应只暴露 public surface，内部 signal/state/watch 不应进入 framework wrapper 类型。

## Parts 与 CSS Variables

Stencil 不从 DOM `part="..."` 自动推断 docs，需要通过 JSDoc：

```ts
/**
 * @part control - The native input element.
 */
```

CSS custom properties 通过 CSS 注释记录：

```css
:host {
  /**
   * @prop --z-demo-input-border: Border color for the input shell.
   */
  --z-demo-input-border: #334155;
}
```

这些会进入 `custom-elements.json` 的 `parts` 和 `styles`，用于文档、设计系统站点或 registry。

Zeus 当前 headless metadata 已有 `cssVars` 和 `meta.cssParts`。这比 Stencil 的 JSDoc 提取更结构化。建议保留结构化声明，同时允许从模板/样式中做自动补充或校验。

## Lifecycle Methods

Stencil class component 可以实现一组生命周期方法：

- `connectedCallback()`：元素每次连接到文档时调用，可多次发生。
- `disconnectedCallback()`：元素断开连接时调用，也可多次发生。
- `componentWillLoad()`：首次渲染前调用一次，可返回 Promise。
- `componentDidLoad()`：首次渲染后调用一次。
- `componentShouldUpdate(newValue, oldValue, propName)`：决定 prop/state 更新是否触发渲染。
- `componentWillRender()` / `componentDidRender()`：每次 render 前后调用。
- `componentWillUpdate()` / `componentDidUpdate()`：非首次更新前后调用。

这套 API 服务于 Stencil 的 class render 模型。Zeus 的核心原则是组件初始化一次，后续由细粒度绑定更新 DOM，因此不应照搬 `componentShouldUpdate`、`componentWillRender` 这类 rerender 生命周期。

Zeus 建议：

- `connectedCallback` 创建 owner/root、同步初始 attributes、建立渲染目标。
- `disconnectedCallback` 释放 owner/root 与 effect cleanup。
- 不引入通用 rerender 生命周期。
- 需要生命周期协作时优先使用显式 hooks，例如 `onCleanup`、事件、或 `ctx.expose()` 暴露命令式方法。
- form-associated 专属生命周期按 Web Platform 命名保留，见下一节。

## Form-Associated Custom Elements

Stencil 通过 `@Component({ formAssociated: true })` 声明表单关联组件，并通过 `@AttachInternals()` 获取 `ElementInternals`。常见能力包括：

- `internals.setFormValue(value, state?)`
- `internals.setValidity(...)`
- `formAssociatedCallback(form)`
- `formDisabledCallback(disabled)`
- `formResetCallback()`
- `formStateRestoreCallback(state, mode)`

Zeus 已采用更直接的 `defineElement` 设计：

```ts
defineElement(
  'z-input',
  {
    formAssociated: true,
    props: {
      value: {
        type: String,
        reflect: true,
      },
    },
  },
  (props, ctx) => {
    ctx.internals?.setFormValue(props.value ?? '')

    return <input value={props.value} />
  },
)
```

实现规则：

- `formAssociated: true` 会设置 custom element class 的静态 `formAssociated = true`。
- runtime 会在 constructor 中 feature-detect `attachInternals()`。
- `ctx.internals` 只在浏览器支持且声明 `formAssociated` 时存在。
- lazy proxy class 也必须带 `static formAssociated = true`，否则浏览器在真实组件加载前不会按表单控件处理。
- `ElementInternals` 不进入 React/Vue wrapper props，它属于 custom element host 能力。

Zeus 后续建议：

- 增加 `formValue` / `formState` 的声明式配置，让常见 input/select 场景无需手写 effect。
- 暴露平台 form callbacks 的显式 options，但不要引入 Stencil class 装饰器。
- 对 SSR/不支持 `ElementInternals` 的环境保持 feature detection，不做 polyfill 假象。

## Host Elements

Stencil 有两套 host 相关能力：

- `@Element() host` 取得 custom element host instance。
- `<Host>` 是虚拟 JSX 节点，用于给 host 设置 attributes/listeners/classes，而不是渲染真实 DOM 节点。

Zeus 已经有 `<Host>` 和 `ctx.host`：

```ts
defineElement('z-field', { shadow: false }, (_props, ctx) => {
  ctx.host.toggleAttribute('data-ready', true)

  return (
    <Host data-slot="field">
      <Slot />
    </Host>
  )
})
```

Zeus 建议：

- 保留 `<Host>` 作为编译期内置节点，不把它当普通组件。
- `ctx.host` 覆盖 Stencil `@Element()` 的命令式场景。
- `ctx.internals` 覆盖 form-associated host internals 场景。
- analyzer 应继续从 `<Host>` 收集 host attributes，用于 docs 与 wrapper metadata。

## Serialization / Deserialization

Stencil 的基础规则是 attributes 只能是字符串，properties 可以是任意 JS 值。它会自动处理 primitive prop 的基础转换，并提供：

- `@PropSerialize()`：把 property 值转成 attribute string。
- `@AttrDeserialize()`：把 attribute string 转回 property 值。

Zeus 不使用装饰器，已在 `PropDefinitionOptions` 上提供同类能力：

```ts
defineElement(
  'z-tags',
  {
    props: {
      tokens: {
        type: Array,
        attr: 'tokens',
        reflect: true,
        default: () => [],
        serialize: value => (value.length ? value.join('|') : null),
        deserialize: value => (value ? value.split('|') : []),
      },
    },
  },
  props => <span>{props.tokens.join(',')}</span>,
)
```

运行规则：

- attribute -> prop 时，若存在 `deserialize`，优先使用它。
- prop -> reflected attribute 时，若存在 `serialize`，优先使用它。
- `serialize` 返回 `null` 或 `undefined` 会删除 attribute。
- 没有自定义函数时，继续使用默认 primitive / JSON 行为。
- analyzer 只在 manifest 中记录 `serialize: true` / `deserialize: true`，不把函数源码写入 manifest。

Zeus 建议：

- object/array 默认仍然应优先 property-only。
- 只有组件作者显式声明 `attr` 和 serializer 时，才让复杂值走 attribute。
- wrapper 不应尝试复刻 serializer；serializer 属于 custom element runtime。

## Styling / Encapsulation

Stencil 支持：

- `shadow: true`：使用 Shadow DOM 封装。
- scoped CSS：无 Shadow DOM 时通过运行时/编译产物做样式作用域。
- `:host` / `::part` / CSS custom properties。
- docs-json 记录 `@part`、CSS `@prop`。

Zeus 当前设计更适合保持两层：

- runtime 能力：`shadow`、`styles`、`parts`、`cssVars`。
- metadata 能力：manifest 中保留 `cssParts`、`cssVars`，供 docs、registry、wrapper 类型使用。

Zeus 建议：

- Shadow DOM 使用浏览器原生封装。
- Light DOM 模式不要伪造 scoped CSS 作为 MVP 阻塞项；优先依赖 class/part/css vars 的明确协议。
- `part` 与 CSS custom properties 应作为公共 styling contract，进入 manifest。
- 后续如做 scoped CSS，应由 compiler 明确生成，不放进 runtime-dom 的高层语义里。

## React Wrapper 机制

Stencil React wrapper 使用 `@stencil/react-output-target/runtime` 的 `createComponent`：

```ts
export const ZDemoInput = createComponent({
  tagName: 'z-demo-input',
  elementClass: ZDemoInputElement,
  react: React,
  events: {
    onValueChange: 'value-change',
    onFocusChange: 'focus-change',
  },
  defineCustomElement: defineZDemoInput,
})
```

重点：

- wrapper 依赖 generated custom element class。
- event map 是显式的。
- prop/property 处理交给 `@lit/react` 风格 runtime。
- custom element registration 通过 `defineCustomElement` 完成。
- ref 指向 custom element，可访问 public methods。

对 Zeus 来说，当前手写生成 `useEffect + addEventListener` 的方式更透明；Stencil 的 runtime wrapper 更轻便但引入 runtime dependency。Zeus 可以继续保持无额外 runtime 或小 runtime，但事件映射表值得稳定成标准 metadata。

## Vue Wrapper 机制

Stencil Vue wrapper 使用 `@stencil/vue-output-target/runtime` 的 `defineContainer`：

```ts
export const ZDemoInput = defineContainer(
  'z-demo-input',
  defineZDemoInput,
  [
    'disabled',
    'formatter',
    'invalid',
    'maxLength',
    'meta',
    'placeholder',
    'value',
    'value-change',
    'focus-change',
  ],
  ['value-change', 'focus-change'],
  'value',
  'value-change',
  undefined,
)
```

重点：

- 第一个数组混合 props 与 events，供 wrapper runtime 做 prop/event 透传。
- 第二个数组是 events。
- 后三个参数是 v-model 映射。
- `defineCustomElement` 让 import wrapper 时可自动注册 custom element。

Zeus Vue wrapper 当前自己生成 `defineComponent`、`onMounted`、`emit`、prop sync。它更可控，但可考虑显式加入 model metadata，以免未来靠命名猜测。

## 对 Zeus 的参考建议

### 1. 建立单一 Component Manifest

Zeus 应有一个稳定 manifest，类似但不完全等同 Stencil `custom-elements.json`：

```ts
interface ZeusComponentManifest {
  tag: string
  exportName: string
  props: PropManifest[]
  events: EventManifest[]
  slots: SlotManifest[]
  parts: PartManifest[]
  cssVars: CssVarManifest[]
  methods: MethodManifest[]
  models?: ModelManifest[]
}
```

这个 manifest 应作为 React/Vue wrapper、WC d.ts、registry、docs 的共同输入。

### 2. 区分 attr-capable props 与 property-only props

Stencil 的 object/function props 不走 HTML attribute。Zeus 应明确：

- `String` / `Number` / `Boolean` 可有 attr channel。
- object / array / function 默认 property-only。
- 是否 reflect 是单独声明。
- attribute name 可覆盖，例如 `maxLength -> max-length`。
- 复杂值只有显式声明 `attr` 与 `serialize`/`deserialize` 时才走 attribute channel。

建议 manifest 字段：

```ts
{
  name: 'maxLength',
  attr: 'max-length',
  type: 'number',
  attribute: true,
  property: true,
  reflect: false,
}
```

### 3. Events 统一保留三个名字

同一个事件应保留：

- framework author key：`valueChange`
- DOM event name：`value-change`
- React prop name：`onValueChange`

不要在 wrapper 生成时临时转换并丢失原始信息。

### 4. 为 Vue model 建 metadata

不要只靠 `value` + `value-change` 猜测 v-model。建议：

```ts
models: [
  {
    prop: 'value',
    event: 'value-change',
    eventPath: 'detail.value',
  },
]
```

React 可以不使用这个字段，但 Vue output target 应使用。

### 5. Methods / Expose 独立建模

Zeus `ctx.expose(...)` 应进入 manifest：

```ts
methods: [
  {
    name: 'focus',
    parameters: [],
    returns: 'void',
    async: false,
  },
]
```

是否像 Stencil 一样强制 async，需要结合 Zeus runtime 判断。建议不要为了兼容 Stencil 而强制 async；Zeus 仍在 beta，可保持自己更直接的 API。但 wrapper 类型必须知道这些 methods。

### 6. Slots 在 React 中继续使用 prop 化策略

Stencil React wrapper 对 named slot 的处理较原生。Zeus 当前把 named slots 转成 React props 更友好：

```tsx
<ZInput prefix={<Icon />} message="Required" />
```

建议保留该策略，同时仍允许原生：

```tsx
<span slot="prefix">...</span>
```

Vue wrapper 则天然适合 named slots：

```vue
<template #prefix>...</template>
```

### 7. Internal state/watch 不进入 wrapper public API

Stencil 把 `@State` 和 `@Watch` 编进 runtime metadata，但 React/Vue wrapper 不暴露。Zeus 也应保持：

- signals/effects/internal state 只属于组件实现。
- wrapper 只看 props/events/slots/parts/cssVars/methods/model。

### 8. Docs metadata 不应依赖注释作为唯一来源

Stencil 依赖 `@slot`、`@part`、CSS `@prop` 注释生成文档。Zeus 可以更进一步：

- `defineElement` options 里显式声明 `meta.slots`、`meta.cssParts`、`cssVars`。
- 编译器从 JSX/模板里校验声明是否存在。
- 文档生成使用显式声明为主，自动发现为辅。

### 9. 产物分层值得借鉴

Stencil 的多产物分层清晰：

- runtime bundle
- custom elements bundle
- collection metadata
- docs-json
- framework wrappers
- types

Zeus Web-C pipeline 也应保持产物目标独立，避免 React/Vue wrapper 直接扫描源码。推荐路径：

```txt
source TSX
  -> Zeus component manifest
  -> wc output
  -> dts output
  -> react wrapper output
  -> vue wrapper output
  -> docs/registry metadata
```

### 10. 不要照搬 Stencil 内部 flag 编码

Stencil runtime 的数字 flag 很紧凑，但不适合作为 Zeus 早期设计目标。Zeus 当前更需要：

- 可读 manifest。
- 可诊断错误。
- 易迁移到 Rust compiler。

内部压缩编码可以等 bundle size 进入优化阶段再做。

### 11. Form-associated 是平台能力，不是 wrapper 能力

React/Vue wrapper 只负责 property、event、slot、method 的框架适配。表单关联能力必须在 custom element class 本身成立：

- eager custom element：`defineElement` 返回的 class 带 `formAssociated`。
- lazy custom element：proxy class 带 `formAssociated`，真实组件加载后通过 `ctx.internals` 协作。
- manifest 记录 `meta.formAssociated`，供 lazy manifest 与文档使用。

### 12. 生命周期保持 Zeus 模型

Stencil 生命周期围绕 class rerender；Zeus 生命周期围绕 owner/root disposal。Zeus 应只吸收平台生命周期边界：

- connected -> mount root
- disconnected -> dispose root
- attributeChanged -> deserialize and update prop signal
- form callbacks -> explicit option/hook

不要增加 `componentShouldUpdate` 这类和 Zeus 细粒度更新模型冲突的 API。

## 结论

Stencil 的强项不是某个 wrapper 文件，而是它把组件 public surface 结构化后，稳定地喂给多个 output target：

- props/attrs 进入 runtime、types、docs、wrappers。
- events 同时有 DOM name、framework name、typed detail。
- methods 进入 element instance 类型。
- slots/parts/css vars 进入 docs metadata。
- Vue v-model 通过显式 model config 进入 wrapper。

Zeus 应重点借鉴这套“结构化 metadata 驱动多产物”的方式，而不是照搬 Stencil 的 lazy runtime 或内部 flag。对 Zeus 来说，最关键的下一步是让 `defineElement` / compiler analyzer 产出一个足够稳定的 component manifest，并让 WC、React、Vue、d.ts、docs 全部由它生成。

本轮 Zeus 已落地的最小功能闭环：

- `defineElement({ formAssociated: true })` 设置 custom element class 静态表单关联标记。
- setup context 新增 `ctx.internals?: ElementInternals`。
- lazy manifest/runtime 传递并应用 `formAssociated`。
- prop options 新增 `serialize` / `deserialize`。
- component analyzer 在 manifest 中记录 `meta.formAssociated` 与 prop 的 `serialize` / `deserialize` 标记。
