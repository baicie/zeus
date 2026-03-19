# AGENTS.md

## 项目背景

这是一个基于 pnpm workspace 的 monorepo 项目，用于管理和开发 Zeus 框架 - 一个现代化的前端框架。

- 使用 TypeScript 和 Rust 混合开发，编译目标为 ES5
- 使用 pnpm 作为包管理器
- 使用 oxc 作为 JavaScript 编译器基础设施
- 使用 NAPI-RS 提供 Rust 和 JavaScript 互操作
- 使用 rolldown 作为构建工具
- 使用 Vitest 进行单元测试和 E2E 测试
- 使用 ESLint 和 Prettier 进行代码质量检查
- 支持多包协同开发和发布

## 架构概述

项目采用分层架构设计：

### Rust 层 (crates/)

- **compiler-core**: 基于 oxc 的核心编译器，负责解析、语义分析和代码生成
- **compiler-dom**: DOM 特定的编译转换，包括 JSX 处理和事件处理优化
- **compiler-ssr**: 服务端渲染编译器，支持流式渲染和数据预取
- **compiler-universal**: 通用编译器，支持多平台打包和优化
- **compiler-common**: 编译器通用工具和配置
- **zeusjs_binding**: NAPI-RS 绑定层，暴露编译器功能给 JavaScript

### TypeScript 层 (packages/)

- **runtime-core**: 核心运行时，提供响应式系统、组件系统和生命周期管理
- **runtime-dom**: DOM 渲染器，负责虚拟 DOM 到真实 DOM 的转换
- **signal**: 响应式信号系统，提供精细化的状态管理
- **web-components**: Web Components 适配器，支持自定义元素
- **shared**: 共享工具函数和类型定义
- **server-renderer**: 服务端渲染运行时
- **zeus**: 统一入口包，整合所有功能模块

## AI助手使用规范

### 语言要求

- **所有回复都使用中文**：在与用户交互时，始终使用中文进行回复和说明

## 安装和设置

### 开发环境要求

- Node.js 版本 >= 18.12.0
- Rust 版本 >= 1.70.0（用于编译 Rust crates）
- 使用 pnpm 作为包管理器（版本 >= 10.28.0）
- 推荐使用支持 TypeScript 和 Rust 的编辑器（如 VS Code with rust-analyzer）

### 系统依赖

对于 macOS：

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装系统依赖（用于 NAPI-RS）
brew install cmake
```

对于 Linux/Ubuntu：

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装系统依赖
sudo apt-get install build-essential cmake
```

### 安装依赖

```bash
pnpm install
```

### 开发命令

#### 主要开发命令

```bash
pnpm dev          # 开发模式（监听模式构建）
pnpm build        # 构建所有包（包括 Rust crates 和 TypeScript packages）
pnpm build-dts    # 单独构建 TypeScript 声明文件
pnpm clean        # 清理构建产物

#### 代码质量检查
pnpm check        # TypeScript 类型检查
pnpm lint         # ESLint 代码检查
pnpm lint-fix     # 自动修复 ESLint 问题
pnpm format       # Prettier 代码格式化
pnpm format-check # 检查代码格式

#### 测试相关
pnpm test         # 运行所有测试
pnpm test-unit    # 运行单元测试
pnpm test-e2e     # 运行 E2E 测试
pnpm test-coverage # 生成测试覆盖率报告

#### 其他工具
pnpm size         # 检查包体积
pnpm benchmark    # 运行性能基准测试
```

## 代码风格指南

### 基本编码规范

#### TypeScript 规范

- 使用 TypeScript 严格模式
- 编译目标为 ES5，避免使用需要更高版本特性的语法
- 使用 ES modules（`import`/`export`）
- 使用 2 空格缩进
- 使用 LF 换行符
- 避免使用 `any` 类型，尽可能精确地定义类型
- 使用接口（interface）而非类型别名（type alias）定义对象结构
- 导出所有公共接口类型，方便用户使用

#### Rust 规范

- 使用 2024 edition Rust
- 遵循项目配置的 Clippy lint 规则
- 使用 4 空格缩进
- 使用 snake_case 命名变量和函数
- 使用 PascalCase 命名类型、traits 和 enums
- 使用 SCREAMING_SNAKE_CASE 命名常量
- 避免使用 `unwrap()`，优先使用 `?` 操作符进行错误处理
- 使用 `Result<T, E>` 和 `Option<T>` 进行类型安全编程

### 设计原则

在代码设计和实现过程中，应遵循以下核心原则：

- **第一性原理**：在进行代码设计规划时，从问题的本质出发，避免过度依赖既有方案，深入思考最优解决方案
- **KISS原则**（Keep It Simple, Stupid）：在代码实现时，优先选择简单直接的方案，避免不必要的复杂性
- **SOLID原则**：
  - **单一职责原则**（Single Responsibility Principle）：每个类或函数只负责一个功能
  - **开闭原则**（Open-Closed Principle）：对扩展开放，对修改关闭
  - **里氏替换原则**（Liskov Substitution Principle）：子类可以替换父类
  - **接口隔离原则**（Interface Segregation Principle）：使用多个专门的接口，而不是单一的总接口
  - **依赖倒置原则**（Dependency Inversion Principle）：依赖抽象而不是具体实现
- **代码复用**：尽量复用已有代码，避免重复代码（DRY原则：Don't Repeat Yourself）
- **架构一致性**：遵循项目既定的架构设计，保持代码风格一致
- **单一职责变更**：代码修改遵循单一职责原则，不混合多个变更，每次修改只解决一个问题

### 语法限制

#### TypeScript 语法限制

由于编译目标为 ES5，以下语法应避免使用：

- **对象展开运算符**：使用 `@zeus-js/shared` 中的 `extend` helper 函数替代
- **可选链操作符**（`?.`）：会导致冗长的辅助函数
- **空值合并操作符**（`??`）：会导致冗长的辅助函数
- **async/await**：使用 Promise 链替代
- **const enum**：使用非 const enum
- **对象展开运算符**：使用 `@zeus-js/shared` 中的 `extend` 函数

#### Rust 语法限制

- 避免使用 `unsafe` 代码块，除非必要
- 避免过度使用宏，除非能显著提高代码可读性
- 避免使用 `clone()`，优先使用引用，除非所有权要求
- 避免使用 `unwrap()` 和 `expect()`，优先使用错误处理

### 命名规范

#### TypeScript/JavaScript 命名规范

- 文件名使用 kebab-case（短横线连接）
- 变量和函数名使用 camelCase（小驼峰）
- 类名和接口名使用 PascalCase（大驼峰）
- 常量使用 UPPER_SNAKE_CASE（大写下划线）
- 私有成员使用下划线前缀（`_privateMethod`）

#### Rust 命名规范

- 包名使用 kebab-case（短横线连接）
- 模块名使用 snake_case（下划线连接）
- 变量和函数名使用 snake_case
- 类型、traits、structs、enums 使用 PascalCase
- 常量使用 SCREAMING_SNAKE_CASE
- 私有字段使用下划线前缀（除非是已实现的 trait 字段）

#### 项目级命名规范

- Rust crates 使用 `zeus-` 前缀（如 `zeus-compiler-core`）
- TypeScript packages 使用 `@zeus-js/` 作用域（如 `@zeus-js/runtime-core`）

### 导入规范

#### TypeScript 导入规范

- 使用 `import type` 导入类型
- 导入顺序：外部依赖 → 内部包 → 相对路径
- 使用路径别名（如 `@zeus-js/*`）引用内部包
- 禁止使用 Node.js 内置模块的直接导入，应使用 `node:` 前缀（如 `node:fs`）

#### Rust 导入规范

- 使用 `use` 语句导入模块
- 导入顺序：标准库 → 外部 crate → 内部 crate → 当前 crate
- 使用 `pub use` 重新导出公共 API
- 避免使用通配符导入（`use crate::*`），除非必要
- 使用 `as` 重命名避免命名冲突

### 类型定义

- 组件 props 应使用 interface 定义，便于扩展
- 接口命名应为 `ComponentNameProps` 或 `FunctionNameParams`
- 复杂的数据结构应拆分为多个接口定义
- 适当使用泛型增强类型灵活性
- 使用交叉类型（&）合并多个类型
- 使用字面量联合类型定义有限的选项集合
- 避免使用 `enum`，优先使用联合类型和 `as const`
- 尽可能依赖 TypeScript 的类型推断
- 只在必要时使用类型断言（`as`）

### 代码组织

#### TypeScript 包组织

- 每个包应放在 `packages/` 目录下
- 包的源代码放在 `packages/{package-name}/src/` 目录
- 测试文件放在 `packages/{package-name}/__tests__/` 目录
- 构建产物放在 `packages/{package-name}/dist/` 目录
- 使用 `index.ts` 作为包的入口文件

#### Rust Crates 组织

- 每个 crate 放在 `crates/` 目录下
- crate 源代码放在 `crates/{crate-name}/src/` 目录
- 使用 `lib.rs` 作为库的入口文件
- 使用 `main.rs` 作为二进制程序的入口文件（如果需要）
- 测试文件可以放在 `src/` 目录中（单元测试）或单独的 `tests/` 目录（集成测试）

#### 项目级组织

- `scripts/` 目录存放构建和开发工具脚本
- `playground/` 目录存放演示和测试项目
- `temp/` 目录存放临时构建文件
- 根目录的 `Cargo.toml` 定义 workspace 和共享依赖
- 根目录的 `package.json` 定义 workspace 和共享脚本

## Monorepo 工作流

### 包管理

#### TypeScript 包管理

- 所有包共享根目录的依赖（devDependencies）
- 包特定的依赖应在对应包的 `package.json` 中声明
- 使用 pnpm workspace 协议引用内部包
- 包之间的依赖应通过 workspace 协议声明

#### Rust Crates 管理

- 使用 Cargo workspace 管理多个 crates
- 共享依赖在根 `Cargo.toml` 的 `[workspace.dependencies]` 中声明
- crate 特定的依赖在各自的 `Cargo.toml` 中声明
- 使用 workspace 协议引用内部 crates

### 构建和发布

#### 构建流程

- **Rust crates**: 使用 `cargo build` 或通过 NAPI-RS 构建
- **TypeScript packages**: 使用 rolldown 进行打包和优化
- **声明文件**: 使用 TypeScript 编译器生成 `.d.ts` 文件
- 构建产物应放在对应的 `dist/` 目录

#### 发布流程

- 每个包支持独立发布
- Rust crates 通过 `cargo publish` 发布到 crates.io
- TypeScript packages 通过 pnpm publish 发布到 npm
- 发布前确保所有类型检查和测试通过

### 路径别名

项目配置了路径别名以便于包之间的引用：

- `@zeus-js/*` 映射到 `packages/*/src`

## 测试指南

### 测试框架和工具

#### TypeScript 测试

- 使用 Vitest 编写单元测试和 E2E 测试
- 使用 jsdom 环境进行 DOM 相关的测试
- 测试文件命名格式：`*.test.ts` 或 `*.spec.ts`
- 单元测试放在包的 `__tests__/` 目录或与源文件同目录
- E2E 测试放在 `packages/{package-name}/__tests__/e2e/` 目录

#### Rust 测试

- 使用 Cargo 内置测试框架
- 单元测试放在被测试的模块文件中（`#[cfg(test)]` 模块）
- 集成测试放在 `tests/` 目录
- 使用 `#[test]` 属性标记测试函数
- 使用 `assert!`、`assert_eq!` 等宏进行断言

### 测试项目配置

项目配置了多个测试项目：

- **unit**：单元测试（Node 环境）
- **unit-jsdom**：需要 DOM 环境的单元测试
- **e2e**：端到端测试（jsdom 环境）

### 运行测试

```bash
# TypeScript 测试
pnpm test              # 运行所有测试
pnpm test-unit         # 运行单元测试
pnpm test-e2e          # 运行 E2E 测试
pnpm test-coverage     # 生成测试覆盖率报告

# Rust 测试
cargo test             # 运行所有 Rust 测试
cargo test --lib       # 只运行库测试
cargo test --doc       # 运行文档测试
```

### 测试覆盖率要求

- 核心功能测试覆盖率应达到 100%
- 边缘情况和错误处理应充分测试
- 使用 `describe` 和 `it` 组织测试用例（TypeScript）
- 使用描述性测试名称和断言消息
- 测试应独立运行，不依赖外部状态

## Git 和 Pull Request 规范

### 分支管理

禁止直接提交到以下保护分支：

- `main`：主分支，用于发布
- `master`：主分支（如果存在）

### 开发流程

1. 从主分支（`main` 或 `master`）创建新的功能分支
2. 在新分支上进行开发
3. 提交 Pull Request 到目标分支
4. 等待 Code Review 和 CI 通过
5. 合并到目标分支

### 分支命名规范

- 功能开发：`feat/description-of-feature`
- 问题修复：`fix/issue-number-or-description`
- 文档更新：`docs/what-is-changed`
- 代码重构：`refactor/what-is-changed`
- 样式修改：`style/what-is-changed`
- 测试相关：`test/what-is-changed`
- 构建相关：`build/what-is-changed`
- 持续集成：`ci/what-is-changed`
- 性能优化：`perf/what-is-changed`
- 依赖升级：`deps/package-name-version`
- 开发体验：`dx/what-is-changed`
- 工作流：`workflow/what-is-changed`
- 类型相关：`types/what-is-changed`
- 发布：`release/version`

### 分支命名注意事项

1. 使用小写字母
2. 使用连字符（-）分隔单词
3. 简短但具有描述性
4. 避免使用下划线或其他特殊字符
5. 如果与 Issue 关联，可以包含 Issue 编号

### Commit Message 规范

项目使用 Conventional Commits 规范，commit message 格式为：

```
<type>(<scope>): <subject>
```

#### Type 类型

- `feat`：新功能
- `fix`：Bug 修复
- `docs`：文档更新
- `dx`：开发体验改进
- `style`：代码格式（不影响代码运行的变动）
- `refactor`：重构（既不是新增功能，也不是修复 Bug）
- `perf`：性能优化
- `test`：测试相关
- `workflow`：工作流相关
- `build`：构建系统或外部依赖的变动
- `ci`：CI 配置文件和脚本的变动
- `chore`：其他变动（如构建过程或辅助工具的变动）
- `types`：类型定义相关
- `wip`：进行中的工作
- `release`：发布新版本

#### Scope（可选）

指定影响的范围，如包名或模块名。

#### Subject

简短的描述，不超过 50 个字符，首字母小写，结尾不加句号。

#### 示例

```
feat(compiler): add 'comments' option
fix(v-model): handle events on blur (close #28)
docs: update README with installation guide
refactor(parser): simplify AST node creation
```

### Pull Request 规范

#### PR 标题

- PR 标题始终使用英文
- 遵循格式：`<type>: <简短描述>`
- 例如：`fix: fix type error in parser module`
- 例如：`feat: add support for new syntax feature`

#### PR 内容

- PR 内容默认使用英文
- 尽量简洁清晰地描述改动内容和目的
- 可以视需要在英文描述后附上中文说明
- 如果修复了 Issue，请在描述中引用（如 `close #123`）

#### PR 提交注意事项

1. **审核流程**：
   - PR 需要由至少一名维护者审核通过后才能合并
   - 确保所有 CI 检查都通过
   - 解决所有 Code Review 中提出的问题

2. **PR 质量要求**：
   - 确保代码符合项目代码风格
   - 添加必要的测试用例
   - 更新相关文档
   - 大型改动需要更详细的说明和更多的审核者参与
   - 确保 TypeScript 类型检查通过
   - 确保 ESLint 检查通过

3. **工具标注**：
   - 如果是用 Cursor 提交的代码，请在 PR body 末尾进行标注：`> Submitted by Cursor`

### PR 改动类型

- 🆕 新特性提交
- 🐞 Bug 修复
- 📝 文档改进
- 💄 样式/格式改进
- 🤖 TypeScript 更新
- 📦 包体积优化
- ⚡️ 性能优化
- 🛠 重构或工具链优化
- ✅ 新增或更新测试用例
- 🔧 配置或工作流改进

## 质量保证

### 代码质量要求

- 确保代码运行正常，无运行时错误
- 通过所有 TypeScript 类型检查（`pnpm check`）
- 通过所有 ESLint 检查（`pnpm lint`）
- 通过代码格式检查（`pnpm format-check`）
- 测试覆盖率达到要求
- 避免使用已废弃的 API

### 性能要求

- 避免不必要的计算和内存分配
- 合理使用缓存机制
- 优化关键路径的性能
- 注意包体积大小

### 兼容性要求

- 编译目标为 ES5
- 避免使用需要 polyfill 的特性
- 确保在目标环境中正常运行

## 工具链和环境

### 开发工具

- 推荐使用 VS Code 或其他支持 TypeScript 和 Rust 的编辑器
- 配置 ESLint 和 Prettier 插件
- 配置 rust-analyzer 插件
- 使用 TypeScript 严格模式
- 配置 Git hooks 进行代码检查（已通过 simple-git-hooks 配置）

### 构建工具

#### TypeScript 构建

- 使用 rolldown 作为主要打包工具
- 使用 TypeScript 编译器进行类型检查和声明文件生成
- 支持多种输出格式（ESM, CommonJS, IIFE）
- 使用路径别名简化导入

#### Rust 构建

- 使用 Cargo 作为包管理和构建工具
- 使用 NAPI-RS 构建 Node.js 原生模块
- 支持多目标编译（x86_64, aarch64 等）
- 配置了多级优化和调试选项

### CI/CD

- 所有 PR 必须通过 CI 检查
- 包括单元测试、E2E 测试、类型检查、代码风格检查
- 自动化发布流程
- 支持多环境部署

### Git Hooks

项目配置了以下 Git hooks：

- **pre-commit**：运行 lint-staged 和类型检查
- **commit-msg**：验证 commit message 格式

### Lint-staged 配置

提交前会自动运行：

- JavaScript/JSON 文件：Prettier 格式化
- TypeScript 文件：ESLint 修复 + Prettier 格式化

## 代码检查规则

### ESLint 规则要点

- 禁止使用 `debugger`
- 禁止使用 `console.log`，允许 `console.warn`、`console.error`、`console.info`
- 禁止使用对象展开运算符（使用 `extend` helper）
- 禁止使用可选链操作符
- 禁止使用 async/await
- 禁止使用 const enum
- 强制使用 `import type` 导入类型
- 强制使用 `node:` 前缀导入 Node.js 内置模块

### TypeScript 配置要点

- 启用严格模式
- 启用 `isolatedDeclarations` 用于声明文件生成
- 启用 `composite` 模式支持项目引用
- 启用装饰器支持（`experimentalDecorators` 和 `emitDecoratorMetadata`）

### Clippy 配置要点

- 启用 pedantic 规则组（优先级 -1，可被特定规则覆盖）
- 禁止使用 `dbg_macro`、`print_stdout` 等调试宏
- 强制使用 `clone_on_ref_ptr` 避免意外堆分配
- 配置了详细的 lint 规则，包括限制、风格和性能相关规则
- 支持 nursery 规则的警告级别配置

## 特别说明

### 混合语言开发

项目采用 TypeScript 和 Rust 混合开发模式：

- **TypeScript 层**：负责前端框架的核心逻辑、组件系统、渲染器等
- **Rust 层**：负责高性能的编译器功能，通过 NAPI-RS 与 JavaScript 互操作
- **绑定层**：`zeusjs_binding` crate 提供 Rust 函数到 JavaScript 的桥梁

### 性能优化

- Rust crates 使用多级优化配置（dev/debug/release）
- 支持 LTO（Link Time Optimization）和代码剥离
- TypeScript 包使用 rolldown 进行高效打包和树摇优化

### 跨平台支持

- Rust crates 支持多架构编译（x86_64, aarch64）
- TypeScript 包支持多种模块格式和环境
- 统一的包管理确保依赖一致性

### AI 助手使用

如果使用 AI 编程助手（如 Cursor）进行开发，请在提交 PR 时在末尾标注：`> Submitted by Cursor`

## 项目文档规范

### 文档目录

项目文档统一存放在 `docs/` 目录下，包括以下核心文档：

| 文档 | 说明 | 更新要求 |
|------|------|----------|
| [project.md](./project.md) | 项目现状总览，包括已实现功能、架构设计、技术栈、待完成功能 | **开发过程中持续更新** |
| [todo.md](./todo.md) | 开发任务清单，包括待办事项、进行中工作、已完成功能 | **每次任务状态变更时更新** |
| [issues.md](./issues.md) | 开发问题与修复记录，包括 bug、解决方案、已知限制 | **发现问题时创建，修复后更新状态** |
| [zeus-compiler-design.md](./zeus-compiler-design.md) | Zeus 编译器完整设计方案 | 设计阶段完成后基本稳定 |
| [compiler-dom-design.md](./compiler-dom-design.md) | DOM 编译器设计 | 设计阶段完成后基本稳定 |
| [compiler-traverse-design.md](./compiler-traverse-design.md) | traverse 重构设计 | 设计阶段完成后基本稳定 |
| [solidjs-compiler-analysis.md](./solidjs-compiler-analysis.md) | SolidJS 编译器分析 | 参考文档，相对稳定 |

### 文档更新要求

**重要**：以下文档需要在特定事件发生时及时更新：

#### 1. project.md - 项目现状

当发生以下情况时，必须更新此文档：

- ✅ 完成新功能（添加到"已实现功能"列表）
- ✅ 开始新模块开发（添加到"开发状态"）
- ✅ 发现新的技术限制（添加到"已知限制"）
- ✅ 调整技术方案或架构
- ✅ 添加新的包或 crate
- ✅ 变更包的状态（开发中 → 可用）

#### 2. todo.md - 开发计划

当发生以下情况时，必须更新此文档：

- ✅ 开始新任务（从未开始 → 进行中）
- ✅ 完成任务（进行中 → 已完成）
- ✅ 任务被阻塞（添加阻塞原因和解决方案）
- ✅ 任务优先级变更
- ✅ 新增任务
- ✅ 取消任务
- ✅ Sprint 计划更新

#### 3. issues.md - 问题记录

当发生以下情况时，必须更新此文档：

- ✅ 发现新 bug（创建新的问题条目）
- ✅ 开始修复问题（更新状态为"进行中"）
- ✅ 完成修复（更新状态为"已修复"，添加修复方案）
- ✅ 发现新的已知限制（添加到"已知限制"部分）
- ✅ 收到用户反馈（添加到"反馈记录"）

### 文档维护原则

1. **及时性**：文档更新应与代码变更同步，最迟在 PR 合并时完成更新
2. **准确性**：文档内容必须与实际实现一致
3. **完整性**：每个任务、问题、里程碑都应有对应的记录
4. **可追溯性**：问题修复应记录原因、解决方案和验证方法

### AI 助手职责

在使用 Cursor 或其他 AI 助手进行开发时，应：

1. **开始任务前**：检查 `todo.md` 确认任务状态
2. **完成任务时**：更新 `todo.md` 中任务状态
3. **发现 bug 时**：在 `issues.md` 中创建问题记录
4. **修复 bug 时**：更新 `issues.md` 中问题状态
5. **完成功能时**：更新 `project.md` 中对应功能状态
6. **重大变更时**：更新相关设计文档
