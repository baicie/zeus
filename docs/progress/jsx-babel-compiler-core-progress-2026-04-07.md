# Zeus Babel JSX 核心实现进度（阶段1+阶段2最小DOM+组件基础）

> 日期：2026-04-07  
> 关联设计：`docs/architecture/zeus-jsx-compiler-babel-ts-design.md`  
> 关联任务：`docs/todo-jsx-compiler-babel-ts.md`

## 1. 本轮目标与范围

本轮按 MVP 目标实现以下范围：

- 阶段 1：编译器基础设施（config/shared/plugin/api/preprocess/postprocess）
- 阶段 2（最小 DOM）：静态标签、静态属性、文本、`class/className`、事件委托、表达式子节点插入
- 阶段 3（基础）：组件调用路径（`createComponent`）

不在本轮范围内的能力以显式边界处理（抛错或暂不支持），包括：SSR/universal、复杂控制流与列表优化、完整指令生命周期细节。

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

### 2.4 组件基础能力

- 大写标签转 `createComponent(Component, props)`
- 动态 props 生成 getter（最小可用）
- 内置组件名遵循配置（`builtIns`）并走 import helper
- 组件 spread 属性：`<Comp {...props} />`（`Object.assign` 合并）

### 2.5 Fragment 能力

- 支持非空 Fragment（文本与表达式）
- 支持 Fragment 的嵌套 JSX 子节点（element/component/fragment 递归子树）

## 3. 能力边界（当前版本）

以下能力尚未完整实现，当前以“部分支持/受限支持”标注：

- 复杂指令能力（如依赖跟踪、完整 cleanup 生命周期策略）仍需细化
- `generate: "ssr"` / `generate: "universal"` 的完整链路
- 高级 style 场景（如更细粒度 patch 策略）仍可继续优化

## 4. 验证结果

已通过以下验证：

- `pnpm check`
- `pnpm vitest run --project unit-compiler-babel`
- 新增集成包构建：
  - `@zeus-js/babel-preset-zeus`
  - `@zeus-js/rollup-plugin-zeus`
  - `@zeus-js/vite-plugin-zeus`

## 5. 与 Rust + OXC 路线关系

- 本实现用于 MVP 快速迭代与行为验证
- 算法稳定后，将按能力矩阵逐项迁移到 Rust/OXC 主链路
- 文档与任务已同步标注，避免两条实现路径长期漂移

## 6. 下一步建议（按优先级）

1. 推进 SSR/universal 模式骨架与测试夹具
2. 增加 fixture 对比测试（dom/ssr/universal）
3. 完善控制流（`wrapConditionals`）与列表渲染优化
4. 细化 `use:` 指令生命周期和更完整运行时语义

