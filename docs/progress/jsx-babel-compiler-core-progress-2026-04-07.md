# Zeus Babel JSX 核心实现进度（阶段1+阶段2最小DOM+组件基础）

> 日期：2026-04-07  
> 关联设计：`docs/architecture/zeus-jsx-compiler-babel-ts-design.md`  
> 关联任务：`docs/todo-jsx-compiler-babel-ts.md`

## 1. 本轮目标与范围

本轮按 MVP 目标实现以下范围：

- 阶段 1：编译器基础设施（config/shared/plugin/api/preprocess/postprocess）
- 阶段 2（最小 DOM）：静态标签、静态属性、文本、`class/className`、事件委托、表达式子节点插入
- 阶段 3（基础）：组件调用路径（`createComponent`）

不在本轮范围内的能力以显式边界处理（抛错或暂不支持），包括：universal 完整链路、SSR hydration 完整语义、复杂控制流与列表优化、完整指令生命周期细节。

## 2. 已落地实现

### 2.1 核心包与目录

- `packages/compiler` 已创建并接入 workspace
- `addons/babel-preset-zeus`、`addons/rollup-plugin-zeus`、`addons/vite-plugin-zeus` 已创建并可构建

### 2.2 编译器核心能力

- 配置与类型：
  - `src/config.ts`：`CompilerOptions`、`DEFAULT_CONFIG`、`mergeConfig`
  - `src/shared/*`：`types`、`utils`、`dynamic`、`escape`、`constants`
- 插件流程：
  - `src/plugin.ts`：`Program enter/exit + JSX visitor`
  - `src/transform/preprocess.ts`：初始化作用域数据、`requireImportSource` 过滤
  - `src/transform/postprocess.ts`：注入 imports、模板声明、`delegateEvents`
- Programmatic API：
  - `src/api.ts`：`transformSync` / `transformAsync`

### 2.3 DOM 最小能力（`generate: "dom"`）

- 元素模板化：静态标签与静态属性拼接模板字符串
- 动态性检测：使用 `shared/dynamic.ts` 的最小动态判断路径
- 事件委托：收集可委托事件并生成 `$$event` + `delegateEvents([...])`
- 类名处理：`class/className` 静态内联 + 动态 `effect` 更新
- 子节点：文本节点与表达式子节点（`insert`）
- 补充能力：
  - 展开属性：`...props`（`spread` helper）
  - `ref`：`ref(el, value)` 路径
  - `use:`：`use(el, action, value?)`，支持最小 cleanup 重执行
  - `style`：动态对象差分更新（移除旧 key + 更新变更 key）
  - DOM 内嵌 JSX 子树：`<div>text<Child />{expr}</div>` 顺序插入

### 2.4 组件基础能力

- 大写标签转 `createComponent(Component, props)`
- 动态 props 生成 getter（最小可用）
- 内置组件名遵循配置（`builtIns`）并走 import helper
- 组件 spread 属性：`<Comp {...props} />`（`Object.assign` 合并）

### 2.5 Fragment 能力

- 支持非空 Fragment（文本与表达式）
- 支持 Fragment 的嵌套 JSX 子节点（element/component/fragment 递归子树）

### 2.6 SSR 最小骨架能力（`generate: "ssr"`）

- 元素编译可用：静态标签、文本、表达式、嵌套 JSX 子树均可编译
- 属性最小策略：
  - `className` 归一化为 `class`
  - `style={{...}}` 静态对象折叠为内联字符串
  - 动态属性兜底为 `String(expr)`，`on*` 事件属性不输出
- `Fragment` 支持 SSR 字符串拼接路径（不走 `Fragment` 运行时）
- `dangerouslySetInnerHTML` 支持最小语义（innerHTML 优先，忽略 children）
- void 元素不输出闭合标签，且忽略 children
- 表单细节最小支持：
  - `textarea value` 作为标签内容输出（不输出 `value` 属性）
  - `option selected={expr}` 输出条件属性片段
- hydration 最小编译开关：
  - `hydratable: true` 时输出 SSR hydration 标记属性（`data-hk`）
  - 收集 SSR 可水合事件并注入 `ssrHydrationEvents([...])`
  - hydration 策略可配置：`hydrationEventStrategy`（默认）与 `hydrationEventStrategies`（按事件名映射）
  - runtime 最小闭环：`ssrHydrationEvents` + `getSsrHydrationEvents` + `clearSsrHydrationEvents`
  - 客户端恢复执行最小 API：`applyHydrationEvents`（`delegate/native` 分流占位 + 未知策略回退）
  - 真实 attach/解绑最小闭环：支持目标分流绑定、去重 attach 与 `dispose()` 幂等解绑
  - 多容器路由与统计：支持 `eventTargetsByName`/`fallbackTarget`，并返回 `attached/skipped/deduped/targets`
  - 事件选项语义：支持 `capture/passive/once`，并在低能力环境回退到 `capture` 布尔参数
  - 回退统计：新增 `optionFallbackCount` 以验证平台兼容路径

### 2.7 Universal 最小骨架能力（`generate: "universal"`）

- `generate: "universal"` 已打通最小编译路径（不再报 “not implemented”）
- 当前阶段复用 DOM 转换主链路，保证基础 JSX 场景可编译与可测试
- 已覆盖 universal 基础用例（普通元素、Fragment）
- universal 事件路径保持 DOM 委托语义（`delegateEvents`）
- 显式边界：`hydratable` 在 universal / dom 下抛出统一错误，避免误把 SSR 语义带入非 SSR 模式
- 显式边界扩展：非 SSR 模式下 `hydrationEventStrategy` / `hydrationEventStrategies` / `ssrModuleName` 误用统一报错

### 2.8 SSR 对齐差异清单（当前）

- 已对齐：
  - SSR 基础元素/片段字符串化输出
  - 关键属性策略（`className`、`style`、`dangerouslySetInnerHTML`、void、`textarea`/`option`）
  - hydration 最小开关（标记输出）
  - hydratable 事件收集与 helper 注入（最小语义）
  - `hydratable` 约束：仅 SSR 生效，DOM/universal 显式报错
  - `server-renderer` 最小 helper 对齐：`ssrHydrationEvents` 已在 runtime 侧可调用
  - `ssrHydrationEvents` 参数契约升级：兼容 `string[]` 与 descriptor 数组（按 `name + strategy` 去重）
  - hydration 注册读取清理最小闭环 API 已提供，便于后续恢复管线消费
  - hydration 执行入口最小闭环已提供（可验证 descriptor 到执行结果的契约）
  - hydration 真实 attach/解绑最小语义已对齐（不重复绑定、可清理）
  - 跨容器 attach 去重语义已落地（去重键包含目标引用）
  - 事件选项能力探测分层已落地（自动探测 + `supportsEventListenerOptions` 覆盖）
  - 回退降级统计与轻量性能基线已落地（`optionFallbackCount`、`degradedPassive`、`degradedOnce`）
  - 浏览器矩阵测试骨架已落地（Chromium smoke，失败自动降级跳过）
  - 能力快照 API 已落地（`getHydrationCapabilitySnapshot`）
- 待对齐：
  - 与 `@zeus-js/server-renderer` 的完整 helper/API 契约（不仅最小注册表）
  - 真实 DOM attach 深化（Firefox/WebKit 持续集成、真实业务页面 A/B 与更大规模压测）
  - SSR/universal 共享抽象的进一步收敛

## 3. 能力边界（当前版本）

以下能力尚未完整实现，当前以“部分支持/受限支持”标注：

- 复杂指令能力（如依赖跟踪、完整 cleanup 生命周期策略）仍需细化
- `generate: "universal"` 运行时语义完整链路
- SSR hydration（可水合事件、server-renderer API）深度对齐
- 高级 style 场景（如更细粒度 patch 策略）仍可继续优化

## 4. 验证结果

已通过以下验证：

- `pnpm check`
- `pnpm vitest run --project unit-compiler-babel`
- `pnpm vitest run --project unit-server-renderer`
- fixtures 基线：`dom/ssr/universal` 已覆盖高风险矩阵，并补充 hydration strategy、多事件、非法策略回退与边界反向断言
- 新增集成包构建：
  - `@zeus-js/babel-preset-zeus`
  - `@zeus-js/rollup-plugin-zeus`
  - `@zeus-js/vite-plugin-zeus`

## 5. 与 Rust + OXC 路线关系

- 本实现用于 MVP 快速迭代与行为验证
- 算法稳定后，将按能力矩阵逐项迁移到 Rust/OXC 主链路
- 文档与任务已同步标注，避免两条实现路径长期漂移

## 6. 下一步建议（按优先级）

1. 完成 SSR 与 `@zeus-js/server-renderer` API 深度对齐（事件语义细节与平台差异）
2. 推进 `generate: "universal"` 运行时语义完善（非编译期边界）
3. 继续扩展 fixture 对比测试矩阵（复杂条件/列表/嵌套指令）
4. 细化 `use:` 指令生命周期和更完整运行时语义

