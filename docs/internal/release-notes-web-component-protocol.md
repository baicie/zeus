# Web Component Protocol Release Notes

本文是本次 Web Component / primitive component 协议收敛的发版前说明草案。正式 changelog 可从这里提炼。

## 发布重点

- `defineElement` 成为 Web Component public surface 的唯一作者入口。
- `@zeus-js/web-c` 是组件库构建的推荐聚合入口。
- analyzer 从源码结构自动推导常见 metadata，减少组件作者心智负担。
- React / Vue wrapper 统一消费 `ComponentManifest`，不重新猜测组件协议。

## 作者 API 收敛

常规组件作者只需要显式声明：

- `props`
- `emits`
- 必要的 `ctx.expose()`
- 复杂 prop 的 `serialize` / `deserialize`
- 少量文档性 `meta.description`

以下信息默认由 analyzer 推导：

- `models`：由 `<prop>` + `<prop>Change` + `detail.<prop>` 推导。
- `slots`：由 `<Slot>` / 原生 `<slot>` 推导。
- `cssParts`：由静态 `part="..."` 推导。
- `methods`：由 `ctx.expose({ ... })` 推导。
- `hostAttributes`：由 `<Host>` 静态 attribute 推导。

`cssVars` 保留为可选的公开 styling token 文档，不是每个组件都要填写的协议字段。

## 新增/更新能力

### `prop(Boolean)` 简写

```ts
props: {
  disabled: prop(Boolean),
}
```

等价于：

```ts
{
  type: Boolean,
  default: false,
  reflect: true,
}
```

### Vue model 推导

```ts
props: {
  value: String,
},
emits: {
  valueChange: event<{ value: string }>(),
},
```

自动推导：

```ts
models: [
  {
    prop: 'value',
    event: 'value-change',
    eventPath: 'detail.value',
  },
]
```

Vue wrapper 因此支持：

```vue
<ZInput v-model:value="email" />
```

显式 `models` 仅用于非标准事件名或非标准 detail 路径。`models: []` 可关闭推导。

### 外部 setup 函数分析

analyzer 支持：

```ts
function setup(props, ctx) {
  ctx.expose({ focus() {} })
  return <input part="control" />
}

export const ZInput = defineElement('z-input', options, setup)
```

这允许组件源码保持可读，同时不丢失 slots、parts、methods、host attributes 等 metadata。

## 破坏性说明

Zeus 仍处于 beta 阶段且没有真实迁移用户。本次发版按当前唯一认可协议收敛，不保留旧草案兼容层。

- 不推荐继续手写常规 `models`、`meta.slots`、`meta.cssParts`。
- 不推荐使用 `slots`、`parts` 等旧式作者 metadata 作为常规协议入口。
- `props` 和 `defineElement` options 必须保持静态可分析；不要使用 spread、computed key 或动态对象。
- 旧文档中的 `events` 应改为 `emits`。
- 旧文档中的 `cssVars` 数组形态不作为推荐写法；公开 styling token 使用 record 形态。

## 推荐示例

```tsx
export const ZInput = defineElement(
  'z-input',
  {
    shadow: false,
    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
      disabled: prop(Boolean),
    },
    emits: {
      valueChange: event<{ value: string }>(),
    },
  },
  setup,
)
```

## 发版前验证

本次协议相关改动至少执行：

```sh
pnpm check
pnpm lint
pnpm format-check
pnpm test
pnpm build runtime-dom component-analyzer
pnpm -C examples/headless build
```

正式发版窗口还应执行仓库级 precheck：

```sh
pnpm release:precheck
```

如果 API snapshot 有变化，先运行：

```sh
pnpm api:snapshot
pnpm api:check
```

再确认 `docs/api/snapshots/*` diff 是否符合本次发版预期。
