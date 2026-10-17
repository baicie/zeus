# RFC-013：`once(expr)` DOM 初始化 intrinsic

- 状态：Accepted
- 任务：S-009

## 语义

未被局部变量遮蔽的全局 `once(expr)` 是编译期 intrinsic。它只允许出现在原生
DOM 元素的 scalar text、attribute 和 property 绑定中。编译器去掉 `once(...)`
调用并在 IR binding 上设置 `once: true`；runtime 使用初始化路径读取一次值，
不创建 effect，也不建立响应式依赖。

```tsx
<div title={once(props.title)}>{once(props.label)}</div>
<input prop:value={once(props.initial)} />
```

`once()`、多个参数和 spread 参数报告 `ZEUS_INVALID_ONCE_INTRINSIC`。表达式会
产生动态 region 时，或目标是 component prop、event、ref、Show、For、Host、Slot、
节点 binding 时，报告 `ZEUS_INVALID_ONCE_TARGET`，不会生成 region binding。

局部 `const once = ...` 或参数会遮蔽 intrinsic，调用保持普通 JavaScript 语义。
编译器不读取或执行函数值来猜测是否应使用 intrinsic。

## 旧注释迁移

Beta 阶段不保留 `/* @once */` 兼容层。旧注释统一报告
`ZEUS_INVALID_ONCE_TARGET`，诊断包含迁移提示：使用 `once(expression)`，并只在
原生 DOM text/attribute/property 位置使用。旧注释不能静默改变绑定模式。

## 验收

Rust lower/transform 测试覆盖成功 binding、参数形状、shadowed identifier、动态
region、组件/控制流/事件/ref/slot 拒绝和旧注释迁移提示。生成代码必须没有
`once(...)` runtime wrapper，并继续使用现有 `bindText`、`bindAttr`、`bindProp`
初始化参数。Runtime 测试覆盖 `once` binding 不创建 effect，以及 class/style/native
property 的冗余写入消除。
