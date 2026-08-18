# RFC-002：JSX 到 Zeus IR

## 状态

Accepted

## 目标

Zeus IR 是编译器前端、优化 passes 与 codegen 之间的稳定语义协议。Babel 是首个前端和 JS codegen adapter，不是 IR 的数据模型。

## IR 边界

IR 必须可以在不导入 `@babel/types` 的进程中构造、遍历、验证和序列化。

所有节点只包含：

- JSON 可表达的标量、数组和对象；
- Zeus 自有 `SourceSpan`；
- Zeus 自有 `ExpressionIR`，保存源文本与可选 span；
- 稳定的 node kind、binding kind、DOM path 与 flags。

```ts
export interface SourceSpan {
  start: { line: number; column: number; offset?: number }
  end: { line: number; column: number; offset?: number }
}

export interface ExpressionIR {
  kind: 'Expression'
  code: string
  span: SourceSpan
  form: 'value' | 'getter' | 'member'
  forAccessors: Array<{
    forId: number
    item: boolean
    index: boolean
  }>
}
```

Babel lowering adapter 负责把 Babel AST 转为 `ExpressionIR`；Babel codegen adapter 负责将 `ExpressionIR.code` 解析回表达式 AST。优化 passes 不接触 Babel NodePath 或 Babel expression。

`forAccessors` 记录表达式对词法外层 `<For>` item/index 参数的精确依赖。前端必须通过 semantic symbol/reference 关系填充该字段；属性名、字符串、注释或被内层函数参数遮蔽的同名标识符都不构成依赖。codegen 只消费这份 IR 元数据，不得重新扫描 `code` 猜测标识符引用。

## Module 布局

- `packages/core/compiler-shared`：IR 类型、builders、visitor、assertion 与序列化安全测试。
- `packages/core/compiler`：Babel parse/lower 与 Babel DOM codegen adapter。
- compiler 公共入口可以重新导出稳定 IR 类型，但实现文件不重复定义 IR。

`compiler-shared` 不依赖 Babel、DOM runtime 或 Node.js 文件系统。

## 诊断

IR 使用自己的 source span。Babel adapter 负责从 Babel location 转换；诊断 module 只消费 Zeus span。错误必须包含稳定 code、message 和可选 span。

## 测试策略

- `compiler-shared` 测试在无 Babel import 的前提下构造、访问和 JSON round-trip IR。
- compiler pipeline snapshot 继续验证 JSX -> IR -> JS，但测试 fixture 使用 Zeus builders。
- 静态依赖检查确保 `compiler-shared` 源码不出现 `@babel/*`。
- 现有 JSX/Host/Slot/Show/For 编译 snapshot 在迁移后保持语义等价。

## 非目标

- 本阶段不实现 Rust 编译器；
- 不设计 SSR IR 或 hydration IR；
- 不保留旧的 Babel-coupled IR 类型 alias。
