# Zeus 文档索引

> 本文档提供 Zeus 项目文档的快速导航，帮助开发者快速找到所需信息。

## 📁 文档目录结构

```
docs/
├── index.md                      # 文档索引入口 ← 你在这里
├── project.md                    # 项目现状总览
├── todo.md                       # 开发任务清单
├── issues.md                     # 问题与修复记录
│
├── architecture/                 # 架构设计
│   ├── zeus-architecture.md      # 项目整体架构
│   ├── zeus-compiler-design.md  # 编译器完整设计
│   ├── zeus-compiler-oxc1230-design.md  # 编译器绣化方案
│   └── zeus-jsx-compiler-rust-oxc-design.md  # 绣化方案 v2
│
├── analysis/                      # 竞品分析
│   ├── solidjs-compiler-analysis.md  # SolidJS Babel Plugin 分析
│   └── solidjs-compiler-analysis-dom-expressions.md  # dom-expressions 深度解读
│
├── reference/                     # 参考文档
│   ├── compiler-fix-plan.md      # 编译器整改方案
│   └── oxc-sourcemap-design.md  # OXC SourceMap 生成方案
│
└── progress/                      # 进度报告
    └── progress-report-2026-03-31.md  # JSX 编译器进度报告
```

---

## 📖 阅读指南

### 🆕 新加入项目的开发者

1. **先阅读**：[architecture/zeus-architecture.md](./architecture/zeus-architecture.md) - 了解项目整体架构
2. **然后阅读**：[analysis/solidjs-compiler-analysis.md](./analysis/solidjs-compiler-analysis.md) - 理解 JSX 编译的核心原理
3. **最后阅读**：[architecture/zeus-compiler-oxc1230-design.md](./architecture/zeus-compiler-oxc1230-design.md) - 了解 Zeus 的实现方案

### 🔧 想要了解编译器实现

1. **入门**：[architecture/zeus-compiler-design.md](./architecture/zeus-compiler-design.md) - 编译器整体设计
2. **深入**：[architecture/zeus-compiler-oxc1230-design.md](./architecture/zeus-compiler-oxc1230-design.md) - 详细实现指南
3. **参考**：[reference/compiler-fix-plan.md](./reference/compiler-fix-plan.md) - 编译结果对比与整改方案

### 🐛 想要解决问题或追踪 bug

1. **查看已知问题**：[issues.md](./issues.md)
2. **查看任务清单**：[todo.md](./todo.md)
3. **如果是编译器问题**：[progress/progress-report-2026-03-31.md](./progress/progress-report-2026-03-31.md)

---

## 📝 核心文档速查

### 项目状态

| 文档 | 说明 | 更新频率 |
|------|------|----------|
| [project.md](./project.md) | 项目现状、已实现功能、待完成功能 | 开发过程中持续更新 |
| [todo.md](./todo.md) | 开发任务清单、进度追踪 | 每次任务状态变更时更新 |
| [issues.md](./issues.md) | Bug、问题、已知限制 | 发现问题时创建，修复后更新 |

### 架构设计

| 文档 | 说明 | 状态 |
|------|------|------|
| [architecture/zeus-architecture.md](./architecture/zeus-architecture.md) | 项目整体架构与各模块功能 | ✅ 完成 |
| [architecture/zeus-compiler-design.md](./architecture/zeus-compiler-design.md) | 编译器完整设计方案（基于 oxc_traverse） | ✅ 完成 |
| [architecture/zeus-compiler-oxc1230-design.md](./architecture/zeus-compiler-oxc1230-design.md) | JSX 编译器绣化方案（详细实现指南） | ✅ 完成 |

### 竞品分析

| 文档 | 说明 | 状态 |
|------|------|------|
| [analysis/solidjs-compiler-analysis.md](./analysis/solidjs-compiler-analysis.md) | SolidJS Babel Plugin JSX DOM Expressions 分析 | ✅ 完成 |
| [analysis/solidjs-compiler-analysis-dom-expressions.md](./analysis/solidjs-compiler-analysis-dom-expressions.md) | dom-expressions 深度解读 | ✅ 完成 |

### 参考文档

| 文档 | 说明 | 状态 |
|------|------|------|
| [reference/compiler-fix-plan.md](./reference/compiler-fix-plan.md) | JSX 编译器整改方案（关键发现：SolidJS 不使用占位符） | ⚠️ 参考 |
| [reference/oxc-sourcemap-design.md](./reference/oxc-sourcemap-design.md) | OXC SourceMap 生成方案 | ⚠️ 设计中 |

---

## 🔑 核心概念速查

### 编译流程

```
源代码 JSX → oxc_parser → AST → oxc_traverse → oxc_codegen → 输出代码
```

### 关键文件位置

| 功能 | 文件路径 |
|------|----------|
| Rust 编译器核心 | `crates/compiler-core/src/` |
| DOM 编译器 | `crates/compiler-dom/src/` |
| SSR 编译器 | `crates/compiler-ssr/src/` |
| 运行时核心 | `packages/runtime-core/src/` |
| DOM 渲染器 | `packages/runtime-dom/src/` |
| 响应式信号 | `packages/signal/src/` |

### 编译输出示例

**输入**：
```tsx
<div className="container">
  <h1>{title}</h1>
  <button onClick={handleClick}>Click</button>
</div>
```

**期望输出**：
```javascript
const _tmpl$1 = template("<div><h1><!----></h1><button>Click</button></div>");
delegateEvents(["click"]);

function Component() {
  const _el$ = _tmpl$1();
  const _h1$ = _el$.firstChild;
  const _btn$ = _h1$.nextSibling;
  
  insert(_h1$, () => title());
  _btn$.$$click = handleClick;
  
  return _el$;
}
```

---

## 📋 待完成文档

| 文档 | 优先级 | 说明 |
|------|--------|------|
| `README.md` | P0 | 项目说明 |
| `CONTRIBUTING.md` | P1 | 贡献指南 |
| `architecture/compiler-dom-design.md` | P1 | DOM 编译器设计文档 |
| `architecture/compiler-traverse-design.md` | P1 | traverse 重构设计文档 |
| API 文档 | P1 | 运行时 API 文档 |
| 迁移指南 | P2 | 从其他框架迁移 |
| 性能优化指南 | P2 | 最佳实践 |

---

## ⚠️ 注意事项

1. **文档与代码同步**：在进行代码修改时，同步更新相关文档
2. **中文优先**：所有文档使用中文编写（除 PR 标题外）
3. **版本标注**：进度报告需标注日期
4. **目录分类**：新增文档时请放入对应目录

---

*本文档最后更新于 2026 年 4 月*
