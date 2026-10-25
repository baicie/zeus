# RFC-010：RFC-WC-ABI-V1 Web Component ABI

- 状态：Accepted（规范冻结；运行时与发布矩阵按任务表独立验收）
- 日期：2026-10-17
- 对应设计任务：W-001、W-007～W-013、F-008
- 依赖：RFC-003、RFC-007

## 摘要

Zeus Web Component（WC）ABI 是 Custom Element 与 React/Vue wrapper 之间的稳定边界。
WC 负责属性、Property、CustomEvent、Slot、方法、样式、表单和生命周期；wrapper 只负责把框架值映射到这个边界，不重新实现组件状态机或 DOM 更新。

本 RFC 冻结可序列化的 `ComponentManifest` v1。Analyzer 只生成这一份模型；WC、React、Vue、`custom-elements.json` 和 DTS 输出都消费同一个 Manifest，不重新推断组件契约。JSON 中不得携带函数、实例或运行时 Event 对象。

## 1. ABI 数据模型

下列 TypeScript 是当前唯一落盘 schema，不是组件运行时 API。对象映射的键是 prop、event、slot、method 与 CSS variable 的名字。`schemaVersion` 必须为数字 `1`；未知版本必须在构建期报错，不能静默按旧版本解释。

```ts
type ComponentPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'unknown'

interface ComponentManifest {
  schemaVersion: 1
  components: ComponentRecord[]
}

interface ComponentRecord {
  tag: string
  name: string
  exportName: string
  source: string
  description?: string
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
  meta?: {
    shadow?: boolean
    formAssociated?: boolean
    [key: string]: unknown
  }
}

interface ComponentProp {
  type: ComponentPropType
  declaration?: { reference?: string; type: string }
  required?: boolean
  values?: string[]
  default?: unknown
  hasDefault?: boolean
  defaultStrategy?: 'static' | 'factory'
  reflect?: boolean
  attr?: string | false
  serialize?: boolean
  deserialize?: boolean
  description?: string
}

interface ComponentEvent {
  key?: string
  name?: string
  reactName?: string
  detail?: Record<string, string>
  detailOptional?: string[]
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
  description?: string
}

interface ComponentSlot {
  name?: string
  description?: string
}

interface ComponentMethod {
  name: string
  description?: string
  parameters?: Array<{
    name: string
    type: string
    optional?: boolean
    rest?: boolean
  }>
  returns?: string
  async?: boolean
}

interface ComponentModel {
  prop: string
  event: string
  eventPath?: string
}

interface ComponentCssVar {
  name: string
  description?: string
}
```

`detail` 映射事件 payload 字段名与类型；`detailOptional` 是其中可省略字段名的唯一列表。
Analyzer 保留 `event<{ value: string; nativeEvent?: Event }>()` 的可选标记，生成
`detail: { value: 'string', nativeEvent: 'Event' }` 和 `detailOptional: ['nativeEvent']`。
WC/JSX/React/Vue 声明、Custom Elements Manifest 和 API 文档使用同一 formatter，输出
`{ value: string; nativeEvent?: Event }`；读取可选字段得到 `Event | undefined`，不会将整个
payload 泛化为 `unknown`。列表只允许唯一字符串，并且每个名字必须存在于 `detail`。

合并时，`detailOptional` 始终跟随所选的 `detail`：已声明的类型优先于 setup 推断；
只补充描述的 `meta.events` 保留现有类型和可选性。显式 metadata 替换 `detail` 时，必须
同时提供所需的 `detailOptional`；省略列表表示新 detail 的全部字段必填，不继承旧字段的
可选性。

`default` 仅用于 JSON-safe 静态默认值；工厂默认值由组件实现创建，并以 `hasDefault: true`、`defaultStrategy: 'factory'` 且不包含 `default` 表达。数组和普通对象可作为 JSON-safe 静态值；函数、实例、循环引用、访问器、symbol、bigint、非有限数及 `-0` 不能写入 Manifest。复杂类型默认使用 `attr: false`，除非声明了受支持的序列化策略。

`schemaVersion: 1` 是唯一接受的版本字段；Analyzer 与各输出层不得写入旧的 `version` 字段，也不得把另一套字段布局混入同一产物。包名/版本来自 package metadata，不属于当前 Manifest schema。`styles` 与 `styleNonce` 是组件实现配置：lazy entry 加载组件模块后由 `mountElementDefinition` 从 definition options 注入，它们不复制进 ABI Manifest。当前 v1 的事件可选字段使用上文唯一表示；后续若改变已有字段的含义或替换字段布局，必须升级 schema 并显式迁移，符合 beta 阶段不保留兼容入口的规则。

## 2. 值与生命周期语义

### 2.1 属性输入

每次显式输入只能经过一次规范化：

```text
attributeChangedCallback
  -> deserialize once
  -> PropStore.set({ source: 'attribute' })
  -> bindings

property setter
  -> validate/normalize property
  -> PropStore.set({ source: 'property' })
  -> optional reflection (guarded)
  -> bindings once
```

`RFC-007` 的 `NormalizedPropChange` 是当前实现协议。反射导致的 `attributeChangedCallback` 不是新的显式写入，不能重新解码或覆盖较新的 Property。

优先级固定为：schema default → 初始 attribute → pre-upgrade own-property replay → 最后一次显式 attribute/property 写入。`undefined` 和 `null` 都是显式值，当前版本不把 `undefined` 隐式解释为“恢复 default”。

原始类型约定如下：

| 类型               | Attribute          | Property             | 约束                                           |
| ------------------ | ------------------ | -------------------- | ---------------------------------------------- |
| `string`           | 原样字符串         | 原值                 | 缺失为 default 或 `undefined`                  |
| `number`           | `Number(raw)`      | 原值并按 schema 校验 | 非法数值保留 `NaN`，统一诊断另行实现           |
| `boolean`          | presence 为 `true` | 原值                 | `disabled="false"` 仍为 `true`，移除为 `false` |
| `array` / `object` | 默认禁止           | 保留 identity        | 原地修改不触发浅响应式                         |
| `function`         | 禁止               | 原样 callable        | 不能被 getter 或 wrapper 自动执行              |

### 2.2 Lazy 阶段

Lazy manifest 只能携带 JSON-safe default 与 codec 元数据。未加载实现前，原始 attribute 放在 pending store；实现加载后只对最终原始值执行一次 codec。不能使用 `Function#toString` 重建 codec。

`componentOnReady()` 的含义是实现已完成初始化。`ready-required` 方法必须在该 Promise 完成后调用；`async-proxy` 返回等待实现的 Promise；`sync-unavailable` 在未 ready 时抛稳定错误。宿主在加载期间断开连接时，当前 readiness waiter 和 async proxy 必须以 `ZEUS_WC_DISCONNECTED_BEFORE_READY` reject，不能永久 pending；重连可复用同一个 module Promise 并重新初始化。已完成初始化后再断开则执行实例的 disconnect/dispose 生命周期。

### 2.3 连接生命周期

- `connectedCallback` 幂等；重连新建响应式 root，复用合法 ShadowRoot。
- `disconnectedCallback` 立即释放 root、effects、cleanup 和 Light DOM observer。
- Lazy 加载期间断开不挂载，并拒绝当前 readiness waiter；快速重连复用同一 module Promise 后重新初始化。
- Lazy 实现 chunk 可以并行加载，但后代初始化必须等待已连接的 Zeus lazy 祖先完成初始化，以建立可用的父级 DOM context；该顺序跨 Shadow DOM 边界成立。
- 等待中的宿主移动或断开时，取消并释放旧祖先的等待，再依据当前连接和祖先继续；祖先初始化失败会拒绝当前后代的 readiness。已加载组件重连到尚未 ready 的祖先时，同样先等待祖先，`componentOnReady()` 和异步方法代理须等重连完成。
- Zeus 的受保护 DOM move 可保留当前 owner；普通原生断开/重连按完整生命周期处理。

## 3. Event、Slot、Style 和 Form ABI

### 3.1 Event

事件的 `domName` 是唯一 DOM 名称，`propKey` 用于 React/Vue 映射。`detailType` 是 DTS/诊断用类型引用，不序列化实际对象。Analyzer 必须把 `bubbles`、`composed`、`cancelable` 规范化写入 Manifest；未声明时的唯一默认值是 `true`、`true`、`false`，wrapper 不得重新猜测。运行时单次 `emit(detail, options)` 可以显式覆盖这三个标志，`detail` 始终按原对象传递。

```ts
ctx.emit.valueChange({ value })
// -> new CustomEvent('value-change', {
//      detail: { value }, bubbles: true, composed: true, cancelable: false
//    })
```

React runtime/event-bridge 监听 `domName` 并将原始 `CustomEvent` 传给 `propKey` 回调；React minimal（React 19）把 `onValueChange` 生成成 lowercase DOM prop `onvalue-change`，避免它被当成普通 attribute。Vue 使用 `@value-change`，model 的值从 `eventPath` 读取，并把原始事件传给普通 emits。原生 `focus`、`blur` 等平台事件不转换为同名 CustomEvent。

### 3.2 Slot 与 Shadow/Light

Shadow 模式使用原生 `<slot>`。Light DOM 模式由 Zeus 管理 projection，必须维护节点所有权、placeholder 和 `MutationObserver`，观察直接子节点及 `slot` 属性；observer 不得重新捕获框架生成节点。默认与具名 slot、fallback、重排、detach/reconnect 都是 ABI 行为。

### 3.3 Style 与 Form

`cssParts`、`cssProperties` 描述可观察扩展点；在 Zeus Manifest 中，`cssVars` 是同一组自定义属性的规范化来源，`custom-elements.json` 输出为标准 `cssProperties`。`styles` 注入当前 ShadowRoot 或 Light DOM host。需要 CSP 时通过 `styleNonce` 为每个注入的 `<style>` 设置 nonce。样式节点属于组件 owner，断开时清理，真实重连时重新注入，不能累积重复节点。`formAssociated: true` 时实现必须定义 `attachInternals()` 不可用时的降级，并验证 `setFormValue`、disabled、reset、stateRestore、校验和 native submit。`value` 与 `defaultValue` 需分别标出受控/非受控语义；完整规则见 [受控组件契约](../compiler-host/controlled-components.md)。

## 4. 非法状态与构建诊断

构建必须拒绝以下状态，并返回稳定错误码；不得继续产出看似成功但语义丢失的 wrapper/Manifest。

| 错误码                         | 非法状态                                              | 修复方向                                           |
| ------------------------------ | ----------------------------------------------------- | -------------------------------------------------- |
| `ZEUS_WC_ABI_VERSION`          | `schemaVersion` 不是 `1`                              | 升级 Analyzer 或显式迁移 schema                    |
| `ZEUS_WC_DUPLICATE_TAG`        | 同一输出 registry 中 tag 重复且实现不同               | 保留一个实现或改 tag                               |
| `ZEUS_WC_ATTR_COLLISION`       | 两个 props 使用同一个 attribute alias                 | 使用唯一 alias                                     |
| `ZEUS_WC_REFLECT_CODEC`        | `reflect: true` 没有可逆 primitive/codec              | 设为 `reflect: false` 或提供 static/deferred codec |
| `ZEUS_WC_INVALID_DEFAULT_META` | Manifest 写入函数、实例、非 JSON-safe default         | 使用 `hasDefault` + 实现 factory                   |
| `ZEUS_WC_OBJECT_ATTRIBUTE`     | object/array/function 声明可由普通 attribute 反序列化 | `attr: false` 或声明受审 codec                     |
| `ZEUS_WC_EVENT_NAME`           | `domName` 为空、非法或与另一个事件冲突                | 使用唯一 kebab-case DOM 名称                       |
| `ZEUS_WC_METHOD_READY`         | readiness 与生成 DTS 的返回类型不一致                 | 修正 ABI 或方法实现                                |
| `ZEUS_WC_MODEL`                | model 引用不存在的 prop/event 或 eventPath 无法读取   | 修正 model 元数据                                  |
| `ZEUS_WC_FORM_CONTRACT`        | `formAssociated` 缺少 internals/fallback 定义         | 补齐表单契约或设为 false                           |

同 tag 的相同构造器/版本注册允许幂等；不同实现必须可诊断报错，不能静默 `return`。自动注册入口必须显式标记为有副作用，SSR-safe 入口不得在 import 时访问 DOM 全局。

## 5. 单一数据源与验收映射

Analyzer 先构造 `ComponentRecord` 并收敛到 `ComponentManifest`，再由各输出器消费；输出器不得重新推断默认值、事件名、model eventPath 或 slot 名称。

| ABI 区域           | 当前代码/测试证据                                                                                         | 后续仍需补的验收                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| prop/default/codec | `RFC-007`、`web-c-runtime/__tests__/adapter-contract.spec.ts`、`output-wc/__tests__/generateLazy.spec.ts` | 三浏览器平台反应队列                 |
| registration       | `packages/web-c/output-wc/src/generateRegistration.ts` 及 Rollup 回归                                     | packed consumer 三浏览器             |
| event/DTS          | `component-dts` React/Vue/WC 生成测试                                                                     | ShadowRoot 冒泡与真实 detail 类型    |
| methods/ready      | `web-c-runtime/src/lazy-element.ts`                                                                       | W-007 方法抛错、销毁和 async proxy   |
| slot ownership     | `runtime-dom` Host/Slot 测试                                                                              | W-009 nested/reorder/focus           |
| form               | Manifest `formAssociated` 字段                                                                            | W-010 ElementInternals/reset/restore |

RFC 接受只代表 ABI 规则冻结，不代表整条 Web Component 路线完成。实现任务与剩余工作以 `docs/internal/architecture-roadmap-2026-10.md` 中 W-007～W-013、F-001～F-008 的验收记录为准。

## 6. 示例

```json
{
  "schemaVersion": 1,
  "components": [
    {
      "tag": "z-button",
      "name": "ZButton",
      "exportName": "ZButton",
      "source": "src/button.tsx",
      "meta": { "shadow": false, "formAssociated": false },
      "props": {
        "disabled": {
          "type": "boolean",
          "attr": "disabled",
          "reflect": true,
          "required": false,
          "hasDefault": true,
          "defaultStrategy": "static",
          "default": false
        }
      },
      "events": {
        "press": {
          "key": "press",
          "name": "press",
          "reactName": "onPress",
          "detail": { "nativeEvent": "MouseEvent" },
          "bubbles": true,
          "composed": true,
          "cancelable": false
        }
      },
      "slots": {
        "default": { "name": "default" },
        "suffix": { "name": "suffix" }
      },
      "methods": {
        "focus": {
          "name": "focus",
          "parameters": [],
          "returns": "void",
          "async": false
        }
      },
      "hostAttributes": [],
      "cssParts": ["root"],
      "cssVars": { "--z-button-bg": { "name": "--z-button-bg" } }
    }
  ]
}
```

此示例使用当前生成器实际落盘的 `ComponentManifest` 字段与对象映射结构。
