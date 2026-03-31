# Zeus JSX 编译器开发进度报告

> 生成日期: 2026-03-31

## 概述

本文档记录 Zeus JSX 编译器的开发进度，包括已完成的工作、当前问题和待实现功能。

---

## 已完成的工作

### 1. compiler-core/jsx 模块增强

#### utils.rs 工具函数增强 ✅

新增以下工具函数：

| 函数名 | 功能描述 |
|--------|----------|
| `is_event_attribute` | 检测是否为事件属性名 (onClick, onInput 等) |
| `is_forced_direct_event` | 检测是否为强制非委托模式 (on:click) |
| `is_delegatable_event` | 检测是否为可委托事件 |
| `is_static_value` | 检测属性值是否为静态 |
| `evaluate_static_expr` | 尝试静态求值表达式 |
| `extract_jsx_tag_name` | 检测 JSX 标签名 |
| `is_jsx_component` | 检测 JSX 标签是否为组件 |
| `merge_adjacent_text` | 合并相邻的静态文本 |
| `text_similarity` | 计算文本相似度（用于模板复用检测） |
| `contains_this_reference` | 检测表达式是否包含 this 引用 |
| `is_empty_jsx_child` | 检测 JSXChild 是否为空 |
| `get_text_content` | 计算 JSXChild 的文本内容 |

#### mod.rs 导出更新 ✅

更新了 `crates/compiler-core/src/jsx/mod.rs`，导出新增的工具函数。

---

### 2. compiler-dom/jsx 模块增强

#### attributes.rs 属性处理增强 ✅

主要改进：

1. **事件属性处理**：
   - 区分委托模式和直接绑定模式
   - 支持强制非委托模式 (`on:click`)
   - 正确提取处理函数表达式

2. **属性分类处理**：
   - `ClassName`: 使用 `className()` helper
   - `ClassList`: 使用 `classList()` helper
   - `Style`: 使用 `style()` helper
   - `Ref`: 使用 `use()` helper
   - `Prop`: 使用 `setProp()` helper

3. **Spread 属性支持**：
   - 注册 `spread()` 和 `mergeProps()` helpers
   - 合并多个 class 属性

4. **静态属性内联**：
   - 字符串、数值、布尔值可直接内联到模板

#### children.rs 子节点处理增强 ✅

主要改进：

1. **子节点过滤**：
   - 过滤空白和空表达式
   - 查找最后一个元素索引

2. **Marker 管理**：
   - 支持水合模式的 marker 生成
   - 动态子节点开始/结束 marker

3. **Fragment 处理**：
   - 正确处理 JSX Fragment (`<>...</>`)

4. **条件表达式包装**：
   - 对条件/逻辑表达式使用 memo 包装

#### mod.rs 导出更新 ✅

更新了 `crates/compiler-dom/src/jsx/mod.rs`，导出新增类型：
- `ChildrenResult`
- `DynamicChildResult`
- `expr_to_code`

---

## 当前问题

### 🔴 compiler-core 编译错误

#### 问题 1: `Expression::JSXElement` 类型不匹配

**位置**: `crates/compiler-core/src/jsx/component.rs`

**错误信息**:
```
error[E0308]: mismatched types
   --> crates/compiler-core/src/jsx/component.rs:305:71
    |
305 |                 return Some(Expression::JSXElement(self.builder.alloc(elem.clone_in(self.allocator))));
    |                                                                 ----- ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |                                                                 expected `JSXElement<'_>`, found `Box<'_, JSXElement<'_>>`
```

**原因**: oxc 0.123.0 中 `ArrayExpressionElement::JSXElement` 期望直接的 `JSXElement`，而不是 `Box<JSXElement>`。

**需要修复的位置**:
- 第 305 行: `transform_component_children` 中的单元素返回
- 第 315 行: `transform_component_children` 中的多元素 push

#### 问题 2: `MemberExpression` 变体名称

**位置**: `crates/compiler-core/src/jsx/component.rs`

**错误信息**:
```
error[E0599]: no variant or associated item named `MemberExpression` found for enum `oxc_ast::ast::Expression<'a>`
```

**原因**: oxc 0.123.0 中 `Expression` 的成员访问变体是 `StaticMemberExpression` 和 `ComputedMemberExpression`，而不是 `MemberExpression`。

**需要修复的位置**:
- 第 341 行: match 语句中的 `MemberExpression` 分支

#### 问题 3: 未使用的 import

**警告** (不影响编译但需清理):
- `crates/compiler-core/src/jsx/condition.rs`: 未使用的 `Str` import
- `crates/compiler-core/src/jsx/fragment.rs`: 未使用的 `Box` 和 `Str` import

---

## 待实现功能

### Phase 2: DOM 核心 (进行中)

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 属性处理: 完善 spread 处理 | 🔄 部分完成 | 高 |
| 子节点处理: 完善 marker 处理 | 🔄 部分完成 | 高 |
| 代码生成: 完善 effect 包装 | ⏳ 待实现 | 高 |
| Fragment 支持 | ✅ 部分完成 | 中 |
| 模板复用 | ⏳ 待实现 | 中 |

### Phase 3: 高级特性 (待实现)

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 组件处理: `transform_component`、`getter props` | 🔄 部分完成 | 高 |
| 条件包装: 条件/逻辑表达式 memo 包装 | 🔄 部分完成 | 中 |
| Spread 属性: `processSpreads`、`spread()` | 🔄 部分完成 | 中 |
| classList 处理: 对象展开为 `class:` 前缀 | ⏳ 待实现 | 中 |
| 样式内联: 静态样式对象内联到模板 | ⏳ 待实现 | 低 |
| 合并 class 属性: 多个 `class` 属性合并 | 🔄 部分完成 | 低 |
| 静态值内联: 编译期常量折叠 | ⏳ 待实现 | 中 |

### Phase 4: SSR 支持 (待创建)

| 功能 | 状态 | 优先级 |
|------|------|--------|
| SSR 编译器 crate: 创建 `compiler-ssr` | ⏳ 待创建 | 高 |
| SSR 元素转换: `transform_element_ssr` | ⏳ 待实现 | 高 |
| SSR 属性处理: `ssrAttribute`、`ssrClassList`、`escape` | ⏳ 待实现 | 高 |
| SSR 模板生成: `generate_ssr_template_declarations` | ⏳ 待实现 | 中 |
| SSR 水合: `data-hk` 生成、`getNextElement` | ⏳ 待实现 | 中 |

### Phase 5: 优化与测试 (待实现)

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 模板复用: 相同模板合并 | ⏳ 待实现 | 中 |
| 空标记优化: 移除不必要的 `<!---->` | ⏳ 待实现 | 低 |
| 单元测试: 核心转换逻辑测试 | ⏳ 待实现 | 高 |
| 集成测试: 端到端编译测试 | ⏳ 待实现 | 高 |
| 模板验证: `isInvalidMarkup` | ⏳ 待实现 | 低 |

---

## 下一步工作

### 立即修复 (阻塞编译)

1. **修复 component.rs 中的类型错误**:
   - 将 `Expression::JSXElement` 的 `Box` 包装改为直接使用 `JSXElement`
   - 将 `MemberExpression` 改为 `StaticMemberExpression` 和 `ComputedMemberExpression`

2. **清理未使用的 imports**

### 短期目标

1. 完成 DOM 核心功能
2. 实现组件转换的完整逻辑
3. 添加单元测试

### 中期目标

1. 创建 SSR 编译器 crate
2. 实现水合支持
3. 添加集成测试

---

## 文件修改记录

### 新增/修改的文件

| 文件路径 | 修改类型 | 描述 |
|---------|---------|------|
| `crates/compiler-core/src/jsx/utils.rs` | 修改 | 添加新工具函数 |
| `crates/compiler-core/src/jsx/mod.rs` | 修改 | 更新导出 |
| `crates/compiler-dom/src/jsx/attributes.rs` | 修改 | 增强属性处理 |
| `crates/compiler-dom/src/jsx/children.rs` | 修改 | 增强子节点处理 |
| `crates/compiler-dom/src/jsx/mod.rs` | 修改 | 更新导出 |
| `crates/compiler-core/src/jsx/component.rs` | 修改 | 修复 API 调用 |

---

## 参考文档

- [Zeus 编译器设计文档](../zeus-compiler-oxc1230-design.md)
- [SolidJS dom-expressions 分析文档](../solidjs-compiler-analysis-dom-expressions.md)
