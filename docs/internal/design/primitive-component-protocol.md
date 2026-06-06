# Primitive Component Protocol

本文定义 Zeus UI primitive 组件的源码语法、元数据协议和跨框架 wrapper 生成契约。

目标是让组件作者用尽量低心智负担的语法定义 Web Component，同时让构建工具可以稳定生成：

- Web Component 注册入口
- React wrapper
- Vue wrapper
- `custom-elements.json`
- `zeus.components.json`
- 类型声明
- AI / registry 可消费的组件元数据

## 设计原则

1. 简单写法优先：常见 prop 使用 `value: String` 这类构造器简写。
2. 默认推导优先：能从 key 推导出的名称不要重复写。
3. JS 使用 camelCase，DOM 使用 kebab-case，wrapper 自动映射。
4. 复杂配置才对象化：只有需要 `default`、`reflect`、`values`、`attr` 等配置时才写对象。
5. 源码必须可静态分析：props、emits、slots、expose 的信息必须能被工具链读取或推导。
6. 运行时行为和生成元数据必须一致，不能只让类型好看。

## 能力矩阵覆盖

| 能力                           | 协议状态 | 说明                                                                         |
| ------------------------------ | -------- | ---------------------------------------------------------------------------- |
| 注册方式                       | 已纳入   | 默认 lazy，由组件库产物提供 loader / auto                                    |
| loader / auto                  | 已纳入   | 由 output-wc 生成，不进入核心 runtime                                        |
| runtime 职责                   | 已纳入   | runtime 只做 lazy bootstrap、prop bridge、lifecycle、method proxy 等底层桥接 |
| props                          | 已纳入   | 手写一次，作为 attr、types、docs、wrapper props 的事实来源                   |
| attribute                      | 已纳入   | 默认 camelCase -> kebab-case，特殊情况才写 `attr`                            |
| boolean prop                   | 已纳入   | 默认值为 `false`，attribute 存在表示 `true`                                  |
| object / array / function prop | 已纳入   | 默认不走 attribute，只允许 JS property 传递                                  |
| reflect                        | 已纳入   | 只推荐基础类型 reflect                                                       |
| events                         | 已纳入   | 使用 `emits` 显式声明，对外统一派发 CustomEvent                              |
| 事件命名                       | 已纳入   | DOM 使用 kebab-case，React/Vue 自动映射                                      |
| 事件默认配置                   | 已纳入   | 默认 `bubbles: true`、`composed: true`、`cancelable: false`                  |
| methods                        | 已纳入   | 从 `expose()` 推导，lazy 下生成 method proxy                                 |
| slots                          | 已纳入   | 从 `<slot>` 推导，支持 `shadow: false` slot projection                       |
| parts                          | 已纳入   | 从 `part=""` 推导 cssParts                                                   |
| css vars                       | 已纳入   | 可选显式声明，用于主题、文档和 registry                                      |
| shadow                         | 已纳入   | 组件级配置，headless/light-dom 可用 `shadow: false`                          |
| formAssociated                 | 已纳入   | P2 能力，先保留协议入口                                                      |
| React wrapper                  | 已纳入   | 单独 output 默认仍可选择 minimal；组件库预设在声明事件时应启用 event bridge  |
| Vue wrapper                    | 已纳入   | 单独 output 默认仍可选择 minimal；事件类型来自 `emits`                       |
| types                          | 已纳入   | DOM / JSX / React / Vue 类型由 compiler 生成                                 |
| docs / registry                | 已纳入   | 从 contract + JSDoc 推导，不再手写 `meta.props` / `meta.events`              |
| manifest                       | 已纳入   | compiler 生成，组件作者不手写                                                |
| 测试重点                       | 已纳入   | lazy、props、events、methods 为核心验收项                                    |

## 推荐源码形态

```tsx
import { Host, defineElement, event, prop } from '@zeus-js/zeus'

export const Input = defineElement(
  'zw-input',
  {
    shadow: false,

    props: {
      value: String,
      defaultValue: String,
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

## Props 协议

`props` 是组件对外输入的唯一事实来源。compiler 必须基于它生成 attribute 映射、TypeScript 类型、文档、manifest 和 React/Vue wrapper props。

### 构造器简写

组件作者可以使用构造器声明简单 prop：

```ts
props: {
  value: String,
  disabled: Boolean,
  count: Number,
}
```

推导规则：

| 写法                   | TypeScript prop 类型  | 默认 attribute  |
| ---------------------- | --------------------- | --------------- |
| `value: String`        | `string \| undefined` | `value`         |
| `disabled: Boolean`    | `boolean`             | `disabled`      |
| `count: Number`        | `number \| undefined` | `count`         |
| `defaultValue: String` | `string \| undefined` | `default-value` |

`attr` 默认由 prop key 从 camelCase 转为 kebab-case。只有偏离默认规则时才手写 `attr`。

Boolean prop 默认值为 `false`。DOM attribute 存在时表示 `true`，移除 attribute 表示 `false`。

### 对象写法

需要额外配置时使用对象：

```ts
props: {
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    reflect: true,
  },
}
```

支持字段：

| 字段      | 说明                                                   |
| --------- | ------------------------------------------------------ |
| `type`    | prop 运行时类型，支持 `String`、`Boolean`、`Number` 等 |
| `attr`    | 自定义 attribute 名；默认由 key kebab-case 推导        |
| `default` | 默认值                                                 |
| `reflect` | 是否反射到 attribute                                   |
| `values`  | 有限值集合，用于类型、文档、元数据生成                 |

### Attribute 和 property 边界

基础类型 prop 可以通过 attribute 输入：

| prop 类型  | attribute 支持 | 说明                                    |
| ---------- | -------------- | --------------------------------------- |
| `String`   | 支持           | 直接使用字符串值                        |
| `Number`   | 支持           | 由 runtime 做 number coercion           |
| `Boolean`  | 支持           | attribute 存在表示 true，移除表示 false |
| `Object`   | 不支持         | 只允许 JS property 传递                 |
| `Array`    | 不支持         | 只允许 JS property 传递                 |
| `Function` | 不支持         | 只允许 JS property 传递                 |

`reflect` 只推荐用于 `string / number / boolean`。`object / array / function` 不应 reflect，避免 JSON attribute、函数序列化和循环引用等复杂度进入 runtime。

### 有限值 prop

有限值 prop 推荐使用 `prop(values, options)`：

```ts
type: prop(['text', 'password', 'email'], {
  default: 'text',
  reflect: true,
})
```

推导结果：

```ts
type?: 'text' | 'password' | 'email'
```

不推荐直接使用数组简写：

```ts
type: ['text', 'password']
```

原因是它和未来的数组类型 prop 容易产生语义冲突。

## Emits 协议

`emits` 是组件对外输出事件的唯一事实来源。compiler 必须基于它生成 DOM event metadata、React event props、Vue emits 类型和 manifest events。

### 默认事件名推导

事件使用 camelCase key 声明：

```ts
emits: {
  valueChange: event<{ value: string }>(),
}
```

默认推导：

| emits key     | DOM event      | React prop      | Vue event      |
| ------------- | -------------- | --------------- | -------------- |
| `valueChange` | `value-change` | `onValueChange` | `value-change` |
| `focusChange` | `focus-change` | `onFocusChange` | `focus-change` |

只有需要偏离默认事件名时才显式传入：

```ts
emits: {
  valueChange: event<{ value: string }>('input-value-change'),
}
```

注意：自定义 DOM event name 只改变浏览器事件名，不改变 React prop 来源。上例仍生成 `onValueChange`，并监听 `input-value-change`。

### 事件配置

`event()` 可以扩展事件行为：

```ts
valueChange: event<{ value: string }>({
  bubbles: true,
  composed: true,
  cancelable: false,
})
```

如果传入字符串，它表示自定义 DOM event name：

```ts
valueChange: event<{ value: string }>('input-value-change')
```

如果传入对象，它表示事件选项，并继续使用默认事件名：

```ts
valueChange: event<{ value: string }>({ bubbles: true })
```

默认事件配置：

```ts
{
  bubbles: true,
  composed: true,
  cancelable: false,
}
```

默认 `bubbles: true` 和 `composed: true`，让事件能穿透 Shadow DOM 并被外部应用稳定监听。

### emit API

推荐 setup 参数提供强类型 `emit` 对象：

```ts
;(props, { emit }) => {
  emit.valueChange({ value: 'hello' })
}
```

不提供字符串调用 API。wrapper 和类型生成以 `emits` 声明为唯一权威来源。

## 注册与 runtime 协议

Web-C 输出默认使用 lazy 注册。

要求：

1. `loader` / `auto` 只注册 Proxy Custom Element。
2. 真实组件代码在元素 connected 后再 import。
3. `loader` / `auto` 由组件库产物提供，例如 `@scope/components/wc/loader` 和 `@scope/components/wc/auto`。
4. 核心 runtime 不暴露组件库 loader / auto。

runtime 只负责底层桥接：

- `bootstrapLazy`
- `HostRef`
- `ProxyElement`
- prop / attribute bridge
- lifecycle bridge
- event dispatch
- lazy method proxy

runtime 不负责组件库级别的注册策略、文档、registry 或 wrapper 生成。

## React wrapper 协议

React wrapper 默认使用 minimal 模式：只渲染 `zw-*` 标签并透传普通 props、attrs、children 和 ref。

当组件声明 `emits` 时，React wrapper 必须启用 event bridge，把 `emits` 映射成 React 风格事件 prop。

### React wrapper 事件契约

例如：

```ts
emits: {
  valueChange: event<{ value: string }>(),
}
```

生成类型：

```ts
export interface InputProps {
  onValueChange?: (event: CustomEvent<{ value: string }>) => void
}
```

生成运行时必须等价于：

```ts
element.addEventListener('value-change', onValueChange)
```

要求：

1. `onValueChange` 不应直接透传为 DOM attribute。
2. mount 时绑定 listener。
3. handler 变化时移除旧 listener 并绑定新 listener。
4. unmount 时清理 listener。
5. ref 仍指向底层 custom element。

该设计与 Stencil React output target 的思路一致：将 React prop 名映射到 custom element 事件名，再由 wrapper/runtime 使用 `addEventListener` 桥接。

## Vue wrapper 协议

Vue wrapper 默认使用 minimal 模式：只做 `h('zw-*')` 和 props / attrs / slots 透传。

当组件声明 `emits` 时，Vue wrapper 必须把 `emits` 映射成 Vue event 类型。

例如：

```ts
emits: {
  valueChange: event<{ value: string }>(),
}
```

生成类型：

```ts
export declare const Input: DefineComponent<
  InputProps,
  {},
  {},
  {},
  {},
  {},
  {},
  {
    'value-change': (event: CustomEvent<{ value: string }>) => void
  }
>
```

Vue 模板中使用：

```vue
<Input @value-change="handleValueChange" />
```

## Slots 协议

Zeus 支持 `shadow: false` 下的 slot projection。组件作者可以直接在 JSX 中写：

```tsx
<slot name="prefix" />
<slot name="suffix" />
```

工具链应优先从 JSX 自动分析 slot：

| JSX                      | slot name |
| ------------------------ | --------- |
| `<slot />`               | `default` |
| `<slot name="prefix" />` | `prefix`  |
| `<slot name="suffix" />` | `suffix`  |

复杂场景允许显式声明：

```ts
slots: ['prefix', 'suffix']
```

规则：

1. 静态 JSX slot 可自动分析。
2. 动态 slot name 需要显式 `slots`。
3. 显式 `slots` 在 P1 只补充自动分析结果；同名项可补充描述，不删除 JSX 中推导出的 slot。
4. 生成 `custom-elements.json`、`zeus.components.json` 和 wrapper 类型时必须包含 slot metadata。

## Parts 协议

组件作者可以直接在 JSX 中写 `part`：

```tsx
<input part="control" />
<span part="prefix" />
```

工具链应从静态 `part=""` 自动分析 cssParts：

| JSX                        | css part  |
| -------------------------- | --------- |
| `<input part="control" />` | `control` |
| `<span part="prefix" />`   | `prefix`  |

复杂场景允许显式声明：

```ts
parts: ['control', 'prefix', 'suffix']
```

规则：

1. 静态 `part=""` 可自动分析。
2. 多 part 值按空格拆分，例如 `part="control invalid"`。
3. 动态 part 需要显式 `parts`。
4. 显式 `parts` 在 P1 只补充自动分析结果；同名项不重复输出。
5. 生成 `custom-elements.json`、`zeus.components.json` 和 docs 时必须包含 cssParts metadata。

## CSS Vars 协议

CSS custom properties 无法可靠地从运行时代码完整推导，因此使用可选显式声明：

```ts
cssVars: {
  '--zw-input-color': {
    description: 'Input text color.',
  },
  '--zw-input-border-color': {
    description: 'Input border color.',
  },
}
```

规则：

1. 主题 token 和公共 CSS variable 推荐显式声明。
2. 未声明的内部 CSS variable 不进入公共 API。
3. `custom-elements.json`、`zeus.components.json`、docs 和 registry 只消费显式声明的 public css vars。

## Shadow 与 Form Associated 协议

`shadow` 是组件级配置：

```ts
defineElement('zw-input', {
  shadow: false,
})
```

建议：

1. headless / light-dom 组件默认可以使用 `shadow: false`。
2. 需要封装内部结构或样式隔离的组件可以使用 `shadow: true`。
3. slot projection 在 `shadow: false` 下由 Zeus runtime 支持。

`formAssociated` 是 P2 能力，先保留协议入口：

```ts
defineElement('zw-input', {
  formAssociated: true,
})
```

后续 input / select / checkbox 等表单组件可通过 `ElementInternals` 接入原生表单能力。

## Expose 协议

组件实例方法通过 `expose()` 暴露：

```ts
expose({
  focus() {
    if (inputEl) inputEl.focus()
  },
  blur() {
    if (inputEl) inputEl.blur()
  },
})
```

工具链应从 `expose()` 静态分析方法名和签名。

如果某些场景无法静态分析，允许显式声明：

```ts
methods: ['focus', 'blur', 'select']
```

优先级：

1. 能从 `expose()` 分析时，不要求重复写 `methods`。
2. 分析失败或动态 expose 时，可以使用 `methods` 补充。
3. 生成的 element interface 必须包含 exposed methods。

## 生成元数据规范

组件协议应生成统一中间模型：

```ts
interface PrimitiveComponentMeta {
  tagName: string
  shadow: boolean
  formAssociated?: boolean
  props: PrimitivePropMeta[]
  events: PrimitiveEventMeta[]
  slots: PrimitiveSlotMeta[]
  parts: PrimitivePartMeta[]
  cssVars: PrimitiveCssVarMeta[]
  methods: PrimitiveMethodMeta[]
}
```

### Prop metadata

```ts
interface PrimitivePropMeta {
  name: string
  attr: string
  type: 'string' | 'boolean' | 'number' | 'unknown'
  tsType: string
  default?: unknown
  reflect: boolean
  values?: readonly string[]
}
```

### Event metadata

```ts
interface PrimitiveEventMeta {
  name: string
  domName: string
  reactName: string
  detailType: string
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
}
```

### Slot metadata

```ts
interface PrimitiveSlotMeta {
  name: string
}
```

### Part metadata

```ts
interface PrimitivePartMeta {
  name: string
}
```

### CSS variable metadata

```ts
interface PrimitiveCssVarMeta {
  name: string
  description?: string
}
```

### Method metadata

```ts
interface PrimitiveMethodMeta {
  name: string
  signature: string
}
```

## 命名规则

### camelCase -> kebab-case

```ts
defaultValue -> default-value
valueChange -> value-change
```

### event key -> React prop

```ts
valueChange -> onValueChange
focusChange -> onFocusChange
```

### prop key -> attribute

```ts
defaultValue -> default-value
readonly -> readonly
```

`readonly` 不强制改为 `readOnly`，因为这里描述的是 Web Component prop/attr 契约，不是 React DOM prop。

## 协议收敛

事件只使用声明式 `emits` 与类型化 emit API：

```ts
emit.valueChange(detail)
```

规则：

1. `emits` 是事件元数据的唯一权威来源。
2. 工具链不从 `ctx.emit()` 字符串调用推导未声明事件。
3. wrapper 事件桥接只处理 `emits` 声明的事件。

## 非目标

本文不评估单个组件业务逻辑是否合理，例如 controlled / uncontrolled input 的状态设计。

本文只定义语法和工具链协议。

## 待确认问题

1. `Boolean` prop 默认不主动 reflect；只有 `reflect: true` 才把 property 写回 attribute。attribute -> property 仍按原生布尔 attribute 语义同步。
2. 删除 `ctx.emit()` 字符串 API，只保留由 `emits` 生成的类型化方法。
3. `expose()` 的 P1 静态分析只提取对象字面量方法名；复杂签名和动态 expose 放到 P2。
4. `slots` 显式声明在 P1 只补充 JSX 自动分析结果。
5. `parts` 显式声明在 P1 只补充 JSX 自动分析结果。
6. `formAssociated` 的 P2 具体 API 形态和 ElementInternals 封装边界仍待设计。
