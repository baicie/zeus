# AGENTS.md

## 项目背景

这是一个基于 pnpm workspace 的 monorepo 项目，用于开发和维护 Zeus 框架。

- TypeScript + Rust 混合开发，编译目标 ES2016
- 使用 oxc 作为 JavaScript 编译器基础设施
- 使用 NAPI-RS 提供 Rust 和 JavaScript 互操作
- 使用 rolldown 作为构建工具
- 使用 Vitest 进行测试，ESLint + Prettier 进行代码质量检查

## 架构概述

### Rust 层 (crates/)

- **compiler-core**: 基于 oxc 的核心编译器
- **compiler-dom**: DOM 特定的编译转换
- **compiler-ssr**: 服务端渲染编译器
- **compiler-universal**: 通用编译器
- **compiler-common**: 编译器通用工具
- **zeusjs_binding**: NAPI-RS 绑定层

### TypeScript 层 (packages/)

- **runtime-core**: 核心运行时
- **runtime-dom**: DOM 渲染器
- **signal**: 响应式信号系统
- **shared**: 共享工具函数
- **server-renderer**: 服务端渲染运行时
- **zeus**: 统一入口包

## 安装和设置

### 开发环境要求

- Node.js >= 18.12.0
- Rust >= 1.70.0
- pnpm >= 10.28.0
- macOS 需要安装 cmake：`brew install cmake`

### 开发命令

```bash
pnpm dev          # 开发模式
pnpm build        # 构建所有包
pnpm build-dts    # 构建 TypeScript 声明文件
pnpm clean        # 清理构建产物

pnpm check        # 类型检查
pnpm lint         # ESLint 检查
pnpm lint-fix     # 自动修复
pnpm format       # Prettier 格式化

pnpm test         # 运行所有测试
pnpm test-unit     # 单元测试
pnpm test-e2e     # E2E 测试
pnpm test-coverage # 测试覆盖率
```

## 代码风格指南

### TypeScript 规范

- 使用 TypeScript 严格模式
- 编译目标 ES2016，使用 bundler 模式
- 避免使用 `any` 类型
- 使用接口（interface）定义对象结构
- 导出所有公共接口类型

### Rust 规范

- 使用 2024 edition Rust
- 遵循 Clippy lint 规则
- 避免使用 `unwrap()`，优先使用 `?` 操作符
- 使用 `Result<T, E>` 和 `Option<T>` 进行错误处理

### 文件大小限制

- TypeScript 文件：建议不超过 300 行
- Rust 文件：建议不超过 300 行

### 语法限制

**TypeScript 禁止使用：**
- 对象展开运算符（使用 `extend` helper）
- 可选链操作符（`?.`）
- 空值合并操作符（`??`）
- async/await
- const enum
- `any` 类型

**Rust 禁止使用：**
- `unsafe` 代码块（除非必要）
- `unwrap()` / `expect()`
- 过度使用宏

### 命名规范

| 类型 | 规范 |
|------|------|
| TypeScript 文件 | kebab-case |
| 变量/函数 | camelCase |
| 类/接口 | PascalCase |
| 常量 | UPPER_SNAKE_CASE |
| Rust 模块 | snake_case |
| Rust 类型 | PascalCase |

### 导入规范

- 使用 `import type` 导入类型
- 导入顺序：外部依赖 → 内部包 → 相对路径
- 使用 `node:` 前缀导入 Node.js 内置模块

### 类型定义

- 组件 props 使用 interface 定义
- 避免使用 `enum`，优先使用联合类型
- 适当使用泛型

## Monorepo 工作流

### 包管理

- 使用 pnpm workspace 协议引用内部包
- 使用 Cargo workspace 管理 Rust crates
- 共享依赖在根 `Cargo.toml` 的 `[workspace.dependencies]` 中声明

### 构建和发布

- **Rust crates**: `cargo build` 或 NAPI-RS
- **TypeScript packages**: rolldown
- 构建产物放在 `dist/` 目录

### 路径别名

`@zeus-js/*` 映射到 `packages/*/src`

## 测试指南

- 使用 Vitest 编写测试
- DOM 相关测试使用 jsdom 环境
- 测试文件命名：`*.test.ts` 或 `*.spec.ts`
- E2E 测试放在 `__tests__/e2e/` 目录

### 测试项目

| 项目 | 说明 |
|------|------|
| unit | Node 环境单元测试 |
| unit-compiler | 编译器单元测试 |
| unit-runtime | 运行时单元测试 |
| unit-jsdom | DOM 环境单元测试 |
| e2e | 端到端测试 |

## Git 规范

### 分支命名

- `feat/description` - 功能开发
- `fix/issue-description` - 问题修复
- `docs/what-changed` - 文档更新
- `refactor/what-changed` - 重构
- `ci/what-changed` - CI 配置

### Commit Message

```
<type>(<scope>): <subject>
```

Type: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `ci`, `chore` 等

示例：
```
feat(compiler): add comments option
fix(v-model): handle events on blur
docs: update README
```

### Pull Request

- 标题格式：`<type>: <简短描述>`
- 确保通过类型检查、ESLint、测试
- 大型改动需要详细说明

## 质量保证

- 通过 `pnpm check` 类型检查
- 通过 `pnpm lint` ESLint 检查
- 通过 `pnpm format-check` 格式检查
- 避免使用已废弃的 API

## 工具链

### VS Code 推荐插件

- TypeScript
- ESLint
- Prettier
- rust-analyzer

### Git Hooks

- **pre-commit**: lint-staged 和类型检查
- **commit-msg**: 验证 commit message 格式

## 代码检查规则

### ESLint

- 禁止 `debugger`
- 禁止 `console.log`（允许 warn/error/info）
- 禁止对象展开运算符、可选链、async/await、const enum
- 禁止 `any` 类型
- 强制 `import type` 和 `node:` 前缀
- 强制导入顺序

### TypeScript

- 启用严格模式
- 启用 `isolatedDeclarations`
- 启用 `composite` 和 `incremental`
- 启用装饰器支持

### Clippy

- 启用 pedantic 规则组
- 禁止调试宏（`dbg!`, `println!`）

## 特别说明

### 项目阶段

**MVP 阶段优先考虑：**
- 功能优先，快速验证
- 简化依赖，保持代码简洁

**MVP 阶段无需考虑：**
- 浏览器兼容性
- 向后兼容
- 过度性能优化
- 边缘情况处理

### 混合语言开发

- **TypeScript 层**：核心逻辑、组件系统、渲染器
- **Rust 层**：高性能编译器功能
- **绑定层**：`zeusjs_binding` crate

### AI 助手使用

使用 Cursor 开发时，请在 PR 末尾标注：`> Submitted by Cursor`
