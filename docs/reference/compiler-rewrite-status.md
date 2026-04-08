# Compiler 重写状态（对齐 dom-expressions）

## 目标

将 `dom-expressions/packages/babel-plugin-jsx-dom-expressions` 的核心编译逻辑按 TypeScript 形式重写到 `packages/compiler`，并尽量保持：

- 逻辑行为一致
- 模块拆分一致
- 入口与 transform 流程一致

## 当前已完成

### 目录与模块

`packages/compiler/src` 已建立并补齐主要模块：

- `plugin.ts`
- `config.ts`
- `VoidElements.ts`
- `shared/*`（`preprocess`、`postprocess`、`transform`、`utils`、`fragment`、`component`、`validate`、`constants`）
- `dom/*`（`constants`、`element`、`template`）
- `ssr/*`（`element`、`template`）
- `universal/*`（`element`、`template`）

### 已实现的关键能力

- 插件入口与 Babel visitor 主链路
- JSX 节点分发（DOM / SSR / Universal）
- 组件节点转换主流程（含 children、dynamic getter、spread/mergeProps 基础能力）
- DOM 属性设置主流程（静态属性、动态属性、事件、部分 `ref` 处理）
- SSR 属性与 children 拼接主流程（含 hydration marker 基础逻辑）
- Universal 属性/children/spread/dynamics 主流程
- template 注册/append 主流程（DOM 与 SSR）
- postprocess 阶段的模板收尾与 delegateEvents 插入

## 本轮状态结论

目前实现已从“空目录/占位骨架”推进到“可工作的完整主流程版本”，且无 re-export 到外部源码。

## 仍建议继续收口的差异点

以下是与参考实现相比，仍建议做 1:1 收敛的高优先级点：

1. `dom/element.ts` 的细粒度分支仍可继续对齐：
   - `classList` / `style` 的对象形态与静态内联优化细节
   - `use:`、`prop:`、`oncapture:` 全分支一致性
   - `ref` 在各种表达式形态下的回写细节
2. `ssr/element.ts` 的属性序列化细节仍可继续对齐：
   - class/style/object 与 computed key 细分路径
   - `escapeExpression` 的深层节点处理覆盖度
3. `shared/utils.ts` 与 `shared/transform.ts` 尚可继续补齐参考实现中的边角逻辑：
   - 条件表达式 memo 包装细节
   - 更完整的 dynamic 判定遍历策略

## 当前约束

- 按要求：本阶段未执行测试用例，仅做实现与静态检查收敛。
- 代码已通过当前 lints 检查（针对已修改文件范围）。

## 建议下一步

建议按以下顺序继续收口：

1. `dom/element.ts`（最大行为面）
2. `ssr/element.ts`
3. `shared/utils.ts` + `shared/transform.ts`
4. 最后再统一跑 fixture / transform 测试验证输出一致性
