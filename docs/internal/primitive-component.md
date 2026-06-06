# Zeus Web Component 定义协议

本文是当前 Zeus primitive / Web Component 定义协议的内部权威文档。旧的 `docs/internal/design/primitive-component-protocol.md` 和 `docs/internal/design/primitive-component-implementation.md` 保留为历史设计材料；实现和后续迭代以本文为准。

Zeus 仍处于 beta 阶段且没有真实用户迁移压力。协议收敛时直接采用当前认可的设计，不为旧草案保留 alias、转发入口或 deprecated 兼容层。

## 目标

组件作者使用 `defineElement` 描述一个 Web Component 的 public surface，工具链从同一份源码静态分析出统一 manifest，并生成：

- Web Component lazy / side-effect 注册产物。
- React / Vue wrapper。
- WC / JSX / React / Vue `.d.ts`。
- `custom-elements.json`。
- `zeus.components.json`。
- docs、registry、AI metadata 可消费的结构化信息。

## 核心原则

- `defineElement` 是组件协议入口。
- 作者只需要显式声明会影响运行时行为的协议：`props`、`emits`、必要的 `ctx.expose()` 与特殊 prop 序列化规则。
- 能从源码结构稳定推导的 public surface 必须由 analyzer 自动产出：`models`、`slots`、`cssParts` 不应成为常规组件的必填心智负担。
- `cssVars` 只表示公开 styling token 文档，不是 runtime 样式系统，也不是每个组件都要填写的协议字段。
- JS API 使用 camelCase；attribute 与 DOM event 使用 kebab-case。
- wrapper 不猜测组件协议，只消费 analyzer 产出的 `ComponentManifest`。
- 复杂对象/数组的 attribute 协议必须由组件作者显式 `serialize` / `deserialize` 固定。
- form-associated 能力属于 custom element host，不进入 React/Vue wrapper props。

## 最终定义形态：Input 示例

```tsx
import { Host, Slot, defineElement, event, prop } from '@zeus-js/zeus'

import type { DefineElementContext, EventDefinition } from '@zeus-js/zeus'

export interface InputProps {
  value?: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'search'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  formatter?: (value: string) => string
}

type InputEmits = {
  valueChange: EventDefinition<{ value: string; nativeEvent: Event }>
  focusChange: EventDefinition<{ focused: boolean; nativeEvent: FocusEvent }>
}

type InputHost = HTMLElement & {
  value?: string
  focus(): void
  blur(): void
  select(): void
}

function setup(
  props: InputProps,
  ctx: DefineElementContext<InputHost, InputEmits>,
) {
  let control!: HTMLInputElement

  const getFormattedValue = (value: string) =>
    typeof props.formatter === 'function' ? props.formatter(value) : value

  const handleInput = (nativeEvent: Event) => {
    const value = getFormattedValue(control.value)

    control.value = value
    ctx.host.value = value
    ctx.emit.valueChange({ value, nativeEvent })
  }

  ctx.expose({
    focus() {
      control.focus()
    },
    blur() {
      control.blur()
    },
    select() {
      control.select()
    },
  })

  return (
    <Host
      data-slot="input"
      data-size={() => props.size}
      data-disabled={() => (props.disabled ? '' : undefined)}
      data-invalid={() => (props.invalid ? '' : undefined)}
    >
      <label part="root">
        <span part="prefix" data-slot="input-prefix">
          <Slot name="prefix" />
        </span>

        <input
          ref={(el: HTMLInputElement | null) => {
            if (el) control = el
          }}
          part="control"
          prop:type={() => props.type ?? 'text'}
          prop:value={() => props.value ?? ''}
          placeholder={() => props.placeholder}
          disabled={() => Boolean(props.disabled)}
          required={() => Boolean(props.required)}
          aria-invalid={() => (props.invalid ? 'true' : undefined)}
          onInput={handleInput}
          onFocus={nativeEvent => {
            ctx.emit.focusChange({ focused: true, nativeEvent })
          }}
          onBlur={nativeEvent => {
            ctx.emit.focusChange({ focused: false, nativeEvent })
          }}
        />

        <span part="suffix" data-slot="input-suffix">
          <Slot name="suffix" />
        </span>
      </label>

      <div part="message" data-slot="input-message">
        <Slot name="message" />
      </div>
    </Host>
  )
}

export const ZInput = defineElement<InputProps, InputHost, InputEmits>(
  'z-input',
  {
    shadow: false,

    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
      placeholder: String,
      type: prop(['text', 'email', 'password', 'search'], {
        default: 'text',
        reflect: true,
      }),
      size: prop(['sm', 'md', 'lg'], {
        default: 'md',
        reflect: true,
      }),
      disabled: prop(Boolean),
      required: prop(Boolean),
      invalid: prop(Boolean),
      formatter: Function,
    },

    emits: {
      valueChange: event<{ value: string; nativeEvent: Event }>(),
      focusChange: event<{ focused: boolean; nativeEvent: FocusEvent }>(),
    },

    meta: {
      description: 'Headless input primitive with slots, events and methods.',
    },
  },
  setup,
)
```

`examples/headless/src/input/input.tsx` 使用的就是这套协议。

## Props

支持构造器：

- `String`
- `Number`
- `Boolean`
- `Object`
- `Array`
- `Function`

默认规则：

- `String` / `Number` / `Boolean` 默认 attribute-backed。
- `Object` / `Array` / `Function` 默认 property-only。
- `Function` 不从 attribute 反序列化。
- `reflect: true` 会把 property 写回 attribute。
- `prop([...])` 表达 string literal union，并进入类型与 manifest。
- `prop(Boolean)` 表达常见 boolean attribute，等价于 `{ type: Boolean, default: false, reflect: true }`。

复杂值 attribute 协议：

```ts
tokens: {
  type: Array,
  attr: 'tokens',
  reflect: true,
  default: () => [],
  serialize: value => (value?.length ? value.join('|') : null),
  deserialize: value => (value ? value.split('|') : []),
}
```

规则：

- `serialize` 返回 `null` / `undefined` 会删除 attribute。
- lazy manifest 只记录 `serialize: true` / `deserialize: true` 能力标记，不传函数源码。
- 真正的 serializer / deserializer 始终由真实组件定义执行。
- lazy proxy 记录值来自 property 还是 attribute，避免加载后把未转换字符串当最终 property。

## Events

事件必须声明在 `emits`：

```ts
emits: {
  valueChange: event<{ value: string }>(),
  press: event<{ nativeEvent: MouseEvent }>('press'),
}
```

默认推导：

- `valueChange` -> DOM event `value-change`。
- `valueChange` -> React prop `onValueChange`。
- `bubbles: true`。
- `composed: true`。
- `cancelable: false`。

推荐触发：

```ts
ctx.emit.valueChange({ value: 'next' })
```

未声明的 `ctx.emit.*` 调用不进入 public event surface。这样可以避免 setup 内部调用污染 wrapper 类型。

## Models

`models` 是 manifest 中的 Vue `v-model` 协议，但不要求常规组件手写。

默认推导规则：

- 存在 prop `value`。
- 存在 emit key `valueChange`。
- DOM event name 是 `value-change`。
- event detail 中存在同名字段 `value`。

满足以上规则时，analyzer 自动产出：

```ts
models: [
  {
    prop: 'value',
    event: 'value-change',
    eventPath: 'detail.value',
  },
]
```

这个规则同样适用于 `checked` + `checkedChange`、`open` + `openChange` 等常见受控状态。

只有非标准事件名或非标准 detail 路径才需要显式 `models`：

```ts
models: [
  {
    prop: 'value',
    event: 'commit',
    eventPath: 'detail.nextValue',
  },
]
```

如果组件刚好有 `<prop>Change` 事件但不想暴露为 Vue model，可以显式写 `models: []` 关闭推导。

Vue wrapper 行为：

- 监听 `value-change`。
- 保留原始 `value-change` emit。
- 从 `event.detail.value` 读取 model 值。
- 额外 emit `update:value`。

因此 Vue 用户可以写：

```vue
<ZInput v-model:value="email" />
```

React wrapper 不消费 `models`，React 用户继续通过 `value` + `onValueChange` 显式控制。

## Expose Methods

组件通过 `ctx.expose()` 暴露 host instance 方法：

```ts
ctx.expose({
  focus(): void {
    control.focus()
  },
  async validate(value: string): Promise<boolean> {
    return value.length > 0
  },
})
```

analyzer 当前支持内联对象字面量，提取：

- method name
- 参数名与类型
- optional/default 参数
- rest 参数
- 返回类型
- async 标记

类型生成：

- eager WC / React element d.ts 保留原始同步或异步签名。
- lazy loader 因为要等待 chunk 加载，method proxy 返回值统一包装为 `Promise<...>`。

## Slots / Parts / CSS Vars

Slots：

- `<Slot />` 表示 default slot。
- `<Slot name="prefix" />` 表示 named slot。
- analyzer 自动从 `<Slot>` / 原生 `<slot>` 提取 `slots`。
- 常规组件不要重复声明 `meta.slots`。
- 只有需要补充说明文案，或 slot 不在可静态分析的 JSX 中出现时，才使用 `meta.slots`。

Parts：

- JSX 中的 `part="control"` 会进入 `cssParts`。
- analyzer 自动从静态 `part` attribute 提取 `cssParts`。
- 常规组件不要重复声明 `meta.cssParts`。
- 只有 part 来自运行时字符串、非 JSX 模板或需要额外文档说明时，才使用 `meta.cssParts`。

CSS Vars：

```ts
cssVars: {
  '--z-input-border': {
    description: 'Input border color.',
  },
}
```

`cssVars` 是公开 styling token 文档，供 docs、registry 和 `custom-elements.json` 消费。runtime 不把它们当样式系统。

默认规则：

- 组件不需要为了“完整”而声明 `cssVars`。
- 只有设计系统承诺外部用户可以稳定依赖某个 CSS custom property 时，才写入 `cssVars`。
- 组件内部使用的 CSS custom property 不进入协议。
- 后续如果样式文件进入 analyzer 能力范围，可以从 CSS 中推导候选项，但仍应区分 public token 与内部实现变量。

## Form-Associated

表单关联通过 `formAssociated` 与 `form` 声明：

```ts
defineElement(
  'z-input',
  {
    formAssociated: true,
    props: {
      value: {
        type: String,
        default: '',
      },
    },
    form: {
      value: 'value',
      state: props => props.value ?? null,
      reset(_props, ctx) {
        ctx.host.value = ''
      },
      stateRestore(state, _mode, _props, ctx) {
        ctx.host.value = typeof state === 'string' ? state : ''
      },
    },
  },
  props => <input prop:value={() => props.value ?? ''} />,
)
```

当前行为：

- custom element class 设置 `static formAssociated = true`。
- constructor 中 feature-detect `attachInternals()`。
- setup context 暴露 `ctx.internals?: ElementInternals`。
- `form.value` / `form.state` 建立响应式 effect，同步 `internals.setFormValue(value, state)`。
- `form.associated` / `form.disabled` / `form.reset` / `form.stateRestore` 转发平台回调。
- lazy proxy 在 constructor 中 attach internals 一次，真实组件加载后复用。
- 真实组件未加载或断开时收到的 form callback 会排队，在挂载后按顺序重放。

SSR 或不支持 `ElementInternals` 的环境只做 feature detection，不提供假 polyfill。

## Manifest Contract

`@zeus-js/component-analyzer` 输出：

```ts
export interface ComponentManifest {
  version: 1
  components: ComponentRecord[]
}

export interface ComponentRecord {
  tag: string
  name: string
  exportName: string
  source: string

  props: Record<string, ComponentProp>
  runtimeProps?: Record<string, ComponentProp>
  runtimePropsDiagnostics?: string[]

  events: Record<string, ComponentEvent>
  methods?: Record<string, ComponentMethod>
  models?: ComponentModel[]
  slots: Record<string, ComponentSlot>

  hostAttributes: string[]
  cssParts: string[]
  cssVars: Record<string, ComponentCssVar>

  description?: string
  meta?: {
    shadow?: boolean
    formAssociated?: boolean
    [key: string]: unknown
  }
}
```

消费规则：

- lazy runtime 只消费 `runtimeProps`，不消费合并后的 docs props。
- wrapper 和 d.ts 消费合并后的 `props`、`events`、`methods`、`slots`、`models`。
- `custom-elements.json` 与 `zeus.components.json` 都从 manifest 生成。
- output target 不重新分析源码。

## Output Contract

### Web Components

`@zeus-js/output-wc` 输出：

- lazy proxy class。
- lazy entry chunk。
- `loader.js` / `auto.js`。
- side-effect 注册入口。
- WC d.ts。
- JSX d.ts。
- `custom-elements.json`。
- `zeus.components.json`。

lazy runtime 负责：

- property accessors。
- method proxies。
- attribute/property 来源追踪。
- serializer/deserializer 延迟到真实组件执行。
- reflection loop suppression。
- form-associated internals 与 callback queue。

### React

React wrapper 负责：

- import 对应 Web Component entry。
- props 同步到 custom element。
- `onValueChange` 等 CustomEvent bridge。
- named slot prop 到 DOM slot attribute。
- ref 指向 custom element instance。

React wrapper 不自动生成 controlled component 语义。

### Vue

Vue wrapper 负责：

- import 对应 Web Component entry。
- props 同步到 custom element property。
- DOM CustomEvent bridge。
- named slot VNode 转 DOM slot attribute。
- `models` -> `update:<prop>`。

## 推荐组件库配置

```ts
import zeus, { componentLibrary } from '@zeus-js/web-c/rolldown'

export default zeus({
  components: {
    include: ['src/**/*.tsx'],
  },
  plugins: componentLibrary({
    targets: ['wc', 'react', 'vue'],
    register: 'lazy',
    wrapper: 'event-bridge',
  }),
})
```

## 当前边界

- manifest 还没有独立 schema 包做严格校验。
- analyzer 只提取推荐写法；复杂变量、spread、动态 `ctx.expose()` 不作为协议保证。
- detail 类型推导覆盖常见 TS literal / setup object literal，不等价于完整 TypeScript 类型系统求值。
- Vue `eventPath` 是简单点路径，不是表达式语言。
- React controlled behavior 由用户代码处理，不由 wrapper 生成。

## 验收基线

协议改动至少跑：

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm build-dts
pnpm format-check
pnpm check:exports
pnpm examples:check:all
```

涉及 CJS compiler 产物时再跑：

```sh
pnpm check:compiler-cjs
```
