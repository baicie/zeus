# Compiler 重写 Checklist（按文件）

## `packages/compiler/src/plugin.ts`

- [x] Babel 插件入口
- [x] `JSXElement` / `JSXFragment` visitor 绑定
- [x] `Program.enter/exit` 绑定 preprocess/postprocess

## `packages/compiler/src/config.ts`

- [x] 基础配置项定义
- [x] 默认配置导出
- [x] renderers 细化类型（按最终运行时模块补齐）

## `packages/compiler/src/shared/preprocess.ts`

- [x] 配置合并
- [x] `@jsxImportSource` 过滤开关

## `packages/compiler/src/shared/postprocess.ts`

- [x] 事件委托收尾插入
- [x] DOM/SSR 模板 append 分流
- [x] HTML 校验调用链
- [ ] warn 信息与参考实现文案完全一致（可选）

## `packages/compiler/src/shared/utils.ts`

- [x] import 注册器
- [x] `getTagName` / `isComponent`
- [x] `isDynamic` 基础判定
- [x] `escapeHTML` / `trimWhitespace`
- [x] `convertJSXIdentifier`
- [x] spread 与 template 工具函数
- [x] `isDynamic` 的深层遍历细节（已接入 traverse）
- [x] `transformCondition` 完整行为对齐（memo 包装/嵌套条件）

## `packages/compiler/src/shared/transform.ts`

- [x] JSX 节点分发主链
- [x] DOM/SSR/Universal template 选择
- [x] 表达式与 text 子节点转换主路径
- [x] `transformThis` 等边角逻辑补齐
- [x] 条件表达式 hoist 细节补齐（含 inline/deep 分支）

## `packages/compiler/src/shared/component.ts`

- [x] 组件 props 基础收集
- [x] spread + `mergeProps` 主流程
- [x] dynamic getter props
- [x] children getter/静态 children
- [x] ref 各表达式形态回写行为 1:1 对齐

## `packages/compiler/src/shared/fragment.ts`

- [x] fragment children 主流程

## `packages/compiler/src/dom/constants.ts`

- [x] inline/block 元素集（基础）
- [ ] 与参考实现元素全集对齐（可选）

## `packages/compiler/src/dom/element.ts`

- [x] 元素主流程（attributes + children）
- [x] `setAttr` 主分发（prop/attr/class/style）
- [x] delegated / non-delegated 事件基础逻辑
- [x] `on:` / `oncapture:` 基础处理
- [x] `attr:` / `bool:` 基础处理
- [x] dynamic 属性进入 `dynamics`
- [x] style/classList 对象预处理基础路径（拆分为 `style:*` / `class:*`）
- [x] style/classList 的对象优化与预处理细节 1:1
- [x] `use:` / `prop:` / `contextToCustomElements` 细节补齐（基础路径）
- [x] placeholder / marker 细节与 hydration 路径完全对齐

## `packages/compiler/src/dom/template.ts`

- [x] template 注册
- [x] appendTemplates
- [x] dynamics 包裹主流程
- [x] `isImportNode` / mathml / CE 路径细节对齐

## `packages/compiler/src/ssr/element.ts`

- [x] 基础 SSR 模板拼接
- [x] spread 分支转 `ssrElement`
- [x] children 与 hydration marker 主流程
- [x] style/classList/boolean 基础分支
- [x] classList/style object-computed 基础分支（非 1:1 完全体）
- [x] `escapeExpression` 深层语义对齐
- [x] classList/style object-computed 细节 1:1

## `packages/compiler/src/ssr/template.ts`

- [x] template 去重缓存
- [x] `ssr(...)` 调用生成
- [x] appendTemplates
- [x] `wontEscape` 特殊路径完全对齐

## `packages/compiler/src/universal/element.ts`

- [x] createElement 主流程
- [x] attributes/dynamics/children 主流程
- [x] spread 合并主流程
- [x] ref/use 特殊语义细分补齐

## `packages/compiler/src/universal/template.ts`

- [x] dynamics 包裹主流程
- [x] memo/effect 基础路径

## 交付前建议（非本 checklist 执行）

- [ ] 跑 fixtures 对比输出（DOM/SSR/Universal）
- [ ] 补齐剩余边角分支后做一次全量回归

## 本轮更新说明

- 实现类迁移项已全部收敛完成；当前仅保留可选项与测试建议项未勾选。
