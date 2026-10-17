# RFC-007：Web Component 属性与 Lazy 初始化契约

- 状态：已实现首轮契约；浏览器与发布包矩阵另行验收
- 日期：2026-10-16
- 对应设计任务：W-002、W-003；W-004、W-005 的属性与作用域回归

## 输入边界

Eager 与 Lazy 的 attribute 输入只在宿主边界执行一次反序列化。Property 写入按原值传递；不因为 schema 为 Number、Boolean 等类型而再次转换。组件内部读取相同的规范化值。

```ts
interface NormalizedPropChange {
  name: string
  value: unknown
  source: 'property' | 'attribute'
  rawAttributeValue?: string | null
}
```

`web-c-runtime` 只向已加载实现发送此变更；`mountElementDefinition` 接收 `value`，不再根据其 JavaScript 类型猜测它是不是原始 attribute，也不重新读取 attribute。`rawAttributeValue` 仅记录来源，不能再参与一次解码。Property setter 负责带重入保护的反射，挂载桥不重复反射。

`deserialize: true` 是尚未加载真实 codec 的元数据标记。Loader 将原始 attribute 保存在独立的 `pendingAttributes` 中，不把字符串冒充 array/object 属性值。实现加载后，生成的入口调用 `resolveHostProperties`，安装真实 schema，并仅对最终待处理的原始 attribute 执行一次 codec。之后的变化直接使用真实 codec。加载期间反复写入同一 attribute，只需要解码最终值；其间的 property 写入会取消对应待处理 attribute。

不序列化函数源码，不使用 `eval` 或函数 `toString()` 重建 codec。

## 优先级与值语义

1. 无显式输入时使用 schema default。
2. 初始 attribute 覆盖 default。
3. custom element 定义前的 own-property 在升级时重放，并覆盖初始 attribute。浏览器随后派发的那次初始 attribute 回调不会再次覆盖重放值。
4. 升级完成后，最后一次显式 attribute/property 写入获胜。反射回调不属于新的显式写入。
5. Property 的 `undefined` 与 `null` 均为显式值；本轮没有引入 `undefined` 自动重置默认值的语义。

内建 primitive 解码规则保持明确：Boolean 按 attribute 是否存在判断，`disabled="false"` 仍为 true，移除后为 false；Number 使用 `Number(raw)`，空字符串得到 0，移除后为 undefined；String 原样读取，移除后为 undefined。无初始输入也没有 default 时，属性为 undefined。非法 Number 目前遵循 `Number` 的 NaN 行为；统一诊断及 fallback 仍是后续独立任务，不能声称已交付。

默认使用浅响应式，Array/Object/Function 的 property identity 保持不变。替换引用触发更新，普通对象原地变更不会自动通知。显式 `reactivity: 'deep'` 仍支持嵌套代理，并明确放弃原始对象 identity。

## 默认值的可观察阶段

| 阶段                      | 静态且 JSON 安全的 default                          | 工厂、非 JSON 安全 default          | 仅在实现 chunk 中的 codec                              |
| ------------------------- | --------------------------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| 定义 custom element 之前  | 普通未知元素无框架 accessor；原有 own-property 可读 | 同左                                | 未运行                                                 |
| 已定义但尚未连接          | Manifest 提供默认值                                 | undefined                           | 原始 attribute 暂存，getter 仍为静态 default/undefined |
| 连接且实现正在加载        | 同上；显式写入覆盖 default                          | undefined，显式 property 仍立即可读 | 继续暂存最终 attribute                                 |
| `componentOnReady()` 完成 | 规范化后的最终值                                    | 实现创建默认值并同步回 host getter  | 使用真实 codec 的最终值                                |

Manifest 输出 string、有限 number（排除负零）、boolean、null，以及无环、无 getter、无特殊原型、无 undefined/function/symbol/BigInt 的 JSON 数组和对象。不能安全表达的值省略，留给真实实现。对象通过 `JSON.parse` 构造，避免对象字面量的 `__proto__` 特殊语义。

工厂默认值在实现首次挂载时创建，每个实例独立。断开再连接保留已确定的 prop 值，不额外执行默认值工厂。静态对象默认值遵循 schema 本身的共享引用语义；需要每实例独立的可变集合时必须使用工厂。

Eager 构造时即可执行工厂，Lazy 必须等实现 chunk；这是明确的加载阶段差异，不能宣称两者在 ready 前完全等价。

## 生命周期

- 加载期间 detach 不创建实例或 owner；当前 ready 等待者以 `ZEUS_WC_DISCONNECTED_BEFORE_READY` reject，重新连接后新的 waiter 可在初始化完成时 resolve。
- 快速 detach/reconnect 共享同一加载 promise，不能重复挂载。
- 已挂载宿主断开时释放 owner、effects 与 cleanup；再次连接新建挂载作用域，props 保留。
- `componentOnReady()` 表示实现曾完成初始化，已加载后普通 detach 不使该 promise 永久失效。
- Zeus runtime 的 `moveNodeBefore` 移动处于 guard 内，Eager/Lazy 均保留当前 owner。直接调用原生 DOM API 的普通断开/重连遵循完整生命周期，不保证等同于 runtime move。

## 验证

回归位于 `web-c-runtime/__tests__/adapter-contract.spec.ts`，覆盖 primitive ready 后更新、attribute 移除、自定义 codec 一次解码、一次反射、对象 identity、四阶段 default、工厂隔离与重连、pre-upgrade 重放、加载期间 detach/快速重连、固定 seed 的 150 次属性状态机，以及 runtime DOM move。

`output-wc/__tests__/generateLazy.spec.ts` 验证 Manifest 静态 default 和生成的规范化桥入口；`runtime-dom` 现有属性测试迁移到唯一的 `NormalizedPropChange` 接口。旧的三个位置参数接口直接删除，不保留 beta 兼容分支。

以上属于 JSDOM/单元验证。真实 Chromium/Firefox/WebKit 的平台反应队列、外部发布包消费者、Input 的完整受控状态/Form 与焦点矩阵仍需单独验收；本 RFC 不把这些未执行检查标记为完成。
