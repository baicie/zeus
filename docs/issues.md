# Zeus 开发问题与修复记录

> 本文档记录开发过程中遇到的 bug、问题、解决方案和修复记录。

---

## 1. 编译器问题

### 1.1 Target 枚举冲突

**问题描述**

`compiler-core` 和 `compiler-common` 都定义了 `Target` 枚举，导致编译冲突：

```rust
// compiler-core/src/traverse.rs
pub enum Target {
    Dom,
    Ssr,
    WebComponent,
}

// compiler-common/src/config.rs
pub enum Target {
    Dom,
    Ssr,
    WebComponent,
}
```

**影响**

编译失败，无法确定使用哪个 `Target` 定义。

**状态**: 🔄 进行中

**解决方案**: 将 `Target` 统一到 `compiler-common`，`compiler-core` 引用 `compiler-common::Target`。

**修复步骤**:

1. ✅ 在 `compiler-common/src/config.rs` 中定义统一的 `Target`
2. ✅ 从 `compiler-core` 移除重复定义
3. ⏳ 更新 `compiler-dom` 和 `compiler-ssr` 的引用
4. ⏳ 验证编译通过

---

### 1.2 oxc_traverse Scoping 问题

**问题描述**

使用 `traverse_mut` 时出现 scoping 相关错误：

```
error[E0597]: `scopes` does not live long enough
```

**原因**

`oxc_traverse` 需要一个 `Scoping` 实例，但创建方式不正确。

**状态**: ✅ 已修复

**解决方案**:

```rust
// 错误用法
let scoping = semantic_ret.semantic.scoping();
traverse_mut(&mut pass, &allocator, &mut program, scoping, initial_state);

// 正确用法
let scopes = oxc_semantic::Scoping::default();
traverse_mut(&mut pass, &allocator, &mut program, scopes, initial_state);
```

**相关代码**: `crates/compiler-core/src/traverse.rs`

---

### 1.3 JSXElement 名称解析

**问题描述**

`JSXElementName` 有多个变体，但部分未处理：

```rust
// 当前只处理了部分情况
let tag = match &node.opening_element.name {
    JSXElementName::Identifier(id) => id.name.as_str(),
    JSXElementName::NamespacedName(name) => name.name.name.as_str(),
    JSXElementName::MemberExpression(_) => "div", // 降级处理
    JSXElementName::IdentifierReference(id) => id.name.as_str(),
    JSXElementName::ThisExpression(_) => "div", // 降级处理
};
```

**状态**: ⚠️ 部分修复

**待处理**:

- `MemberExpression` (如 `<Foo.Bar />`) 应正确解析为组件调用
- `ThisExpression` (如 `<this.Foo />`) 需要特殊处理

---

### 1.4 if-return → ternary 转换不完整

**问题描述**

`if-return → ternary` 转换框架已搭建，但 AST 节点替换未实现：

```rust
// 当前只添加了注释标记
fn transform_to_ternary(&mut self, _node: &mut IfStatement<'a>, _ctx: &mut TraverseCtx<'a, S>) {
    self.state.add_helper("/* if-return → ternary conversion pending */");
}
```

**状态**: 🔄 进行中

**预计修复**:

1. 使用 `ctx.replace` 进行节点替换
2. 提取 return 语句中的 JSX
3. 创建 ConditionalExpression 节点
4. 验证父节点类型确保替换正确

**相关代码**: `crates/compiler-core/src/traverse.rs` - `transform_to_ternary`

---

### 1.5 表达式源码生成不完整

**问题描述**

`expression_to_source` 方法未处理所有表达式类型：

```rust
// 未处理的表达式类型
Expression::UpdateExpression(_)      // i++, --i
Expression::AwaitExpression(_)       // await
Expression::YieldExpression(_)      // yield
Expression::ChainExpression(_)     // 可选链
Expression::ImportExpression(_)     // import()
```

**状态**: ⚠️ 部分修复

**影响**

某些 JSX 属性值可能无法正确转换。

**解决方案**:

1. 为未处理的表达式返回占位符（当前）
2. 逐步完善每种表达式的处理
3. 添加测试覆盖

---

## 2. 构建问题

### 2.1 rolldown 插件配置问题

**问题描述**

`rolldown.config.ts` 配置问题导致构建失败：

```
Error: Cannot find module './src/compiler.ts'
```

**状态**: ✅ 已修复

**解决方案**:

检查并修正 `rolldown.config.ts` 中的路径配置：

```typescript
// 正确的路径
import { compiler } from './src/compiler.ts';

// 确保文件存在
```

---

### 2.2 NAPI 构建目标问题

**问题描述**

NAPI-RS 构建失败，提示缺少目标平台支持：

```
Error: The platform you're trying to target is not supported
```

**状态**: ✅ 已修复

**解决方案**:

检查 `package.json` 中的 `napi.targets` 配置，确保目标平台正确：

```json
{
  "napi": {
    "targets": [
      "x86_64-apple-darwin",
      "aarch64-apple-darwin",
      "x86_64-unknown-linux-gnu"
    ]
  }
}
```

---

### 2.3 pnpm workspace 依赖解析

**问题描述**

workspace 包之间的依赖解析失败：

```
Error: Cannot find package '@zeus-js/signal'
```

**状态**: ✅ 已修复

**解决方案**:

确保 `package.json` 中使用正确的 workspace 协议：

```json
{
  "dependencies": {
    "@zeus-js/signal": "workspace:*",
    "@zeus-js/runtime-core": "workspace:*"
  }
}
```

运行 `pnpm install` 重新解析依赖。

---

## 3. 运行时问题

### 3.1 insert 函数 marker 支持

**问题描述**

`insert` 函数当前版本不支持 `marker` 参数，导致动态内容插入位置不正确。

**状态**: 🔄 进行中

**期望行为**:

```typescript
// 应该支持
insert(parent, accessor, marker);

// 例如在 <div>{content}</div> 中
// marker 应该是 comment 节点位置
```

**相关代码**: `packages/runtime-core/src/insert.ts`

---

### 3.2 delegateEvents 事件列表

**问题描述**

`delegateEvents` 需要支持更多事件类型，当前列表不完整。

**状态**: ✅ 已修复

**解决方案**:

添加完整的事件列表：

```typescript
const delegatedEventTypes = [
  // 鼠标事件
  'click', 'mousedown', 'mouseup', 'mouseenter', 'mouseleave',
  'mousemove', 'mouseout', 'mouseover',
  // 触摸事件
  'touchstart', 'touchend', 'touchmove', 'touchcancel',
  // 表单事件
  'input', 'change', 'submit', 'reset', 'invalid',
  // 键盘事件
  'keydown', 'keyup', 'keypress',
  // 焦点事件
  'focus', 'blur',
  // 其他
  'scroll', 'wheel', 'copy', 'cut', 'paste',
  // 媒体事件
  'abort', 'canplay', 'canplaythrough', 'durationchange',
  'emptied', 'ended', 'error', 'loadeddata', 'loadedmetadata',
  'loadstart', 'pause', 'play', 'playing', 'progress',
  'ratechange', 'seeked', 'seeking', 'stalled', 'suspend',
  'timeupdate', 'volumechange', 'waiting',
  // 拖拽事件
  'drag', 'dragend', 'dragenter', 'dragleave', 'dragover',
  'dragstart', 'drop',
  // 全屏事件
  'fullscreenchange', 'fullscreenerror',
  // toggle 事件
  'toggle'
];
```

---

### 3.3 template 函数 SVG 支持

**问题描述**

`template` 函数需要正确处理 SVG 元素，设置命名空间。

**状态**: ⚠️ 已知问题

**期望行为**:

```typescript
// SVG 元素应该自动设置 xmlns 属性
const svgTemplate = template('<svg><path/></svg>', true);
// 内部应该设置 xmlns="http://www.w3.org/2000/svg"
```

**相关代码**: `packages/runtime-core/src/template.ts`

---

## 4. 测试问题

### 4.1 单元测试缺失

**问题描述**

大部分模块缺少单元测试，无法验证修复。

**状态**: 🔄 进行中

**解决方案**:

1. 为 `traverse` 模块添加测试
2. 为 `codegen` 模块添加测试
3. 为 `template_ir` 添加测试
4. 使用 Vitest 框架

---

### 4.2 E2E 测试环境

**问题描述**

Playwright E2E 测试环境未配置。

**状态**: 📋 待开始

**需要配置**:

1. 安装 Playwright
2. 配置测试目录
3. 添加基础测试用例

---

## 5. 文档问题

### 5.1 文档与代码不同步

**问题描述**

部分文档描述的功能与实际实现不一致。

**状态**: ⚠️ 已知问题

**已改善**: 新增 `index.md` 文档索引（放在 `docs/` 根目录），方便开发者快速找到所需文档。

**需要更新**:

- `docs/architecture/compiler-dom-design.md` 中的 API 与实际不符（文档待创建）
- `docs/architecture/compiler-traverse-design.md` 中的代码示例需要更新（文档待创建）

---

## 6. 性能问题

### 6.1 大文件编译性能

**问题描述**

处理大型 JSX 文件时编译速度较慢。

**状态**: 📋 待分析

**可能原因**:

1. AST 遍历效率
2. 模板生成字符串拼接
3. 多次字符串分配

**优化方向**:

1. 使用 `String::with_capacity()` 预分配
2. 减少不必要的克隆
3. 批量处理节点

---

## 7. 已知限制

### 7.1 OXC JSX 支持限制

| 限制 | 说明 | 状态 |
|------|------|------|
| JSX Namespaces | `<ns:element>` | ⚠️ 部分支持 |
| 保留属性名 | `key`, `ref` 等 | ⚠️ 需要特殊处理 |
| 表达式类型 | 部分表达式未支持 | ⚠️ 持续完善 |

### 7.2 运行时限制

| 限制 | 说明 | 状态 |
|------|------|------|
| 旧浏览器 | ES5 兼容性问题 | ⚠️ 需要 polyfill |
| Server Components | RSC 不支持 | ❌ 暂不计划 |
| Web Workers | 隔离环境 | ❌ 暂不计划 |

---

## 8. 反馈记录

### 8.1 用户反馈

暂无用户反馈，项目处于早期开发阶段。

### 8.2 内部反馈

| 日期 | 反馈人 | 内容 | 状态 |
|------|--------|------|------|
| 2026-03-15 | - | if-return 转换需要完善 | 🔄 进行中 |
| 2026-03-15 | - | 需要更友好的错误信息 | 📋 待开始 |
| 2026-03-14 | - | SSR 支持优先级 | 📋 计划中 |

---

## 9. 修复模板

```markdown
### 问题标题

**问题描述**  
简要描述问题。

**影响**  
问题造成的影响。

**状态**: 状态

**解决方案**  
详细的解决方案。

**修复步骤**:

1. ✅ 步骤一
2. ⏳ 步骤二
3. 📋 步骤三

**相关代码**: 文件路径

**测试验证**: 如何验证修复
```

---

*本文档最后更新于 2026 年 3 月*
