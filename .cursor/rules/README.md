# Zeus 框架 Cursor 规则

本目录包含了 Zeus 框架项目的 Cursor 规则文件，用于指导 AI 助手在开发过程中遵循项目的编码规范和最佳实践。

## 规则文件说明

### 📁 文件结构

```
.cursor/rules/
├── README.md           # 本文件，规则说明
├── project.mdc         # 项目背景和基本编码规范
├── typescript.mdc      # TypeScript 开发规范
├── naming.mdc          # 命名规范和 API 设计原则
├── testing.mdc         # 测试规范和最佳实践
├── docs.mdc            # 文档和 Changelog 规范
├── git.mdc             # Git 工作流程和提交规范
└── performance.mdc     # 性能优化规范
```

### 📋 规则文件详情

| 文件名            | 描述                                      | 适用范围        | 自动应用 |
| ----------------- | ----------------------------------------- | --------------- | -------- |
| `project.mdc`     | 项目背景、技术栈、基本编码规范            | 所有代码文件    | ✅       |
| `typescript.mdc`  | TypeScript 类型定义、泛型使用、JSDoc 规范 | TypeScript 文件 | ❌       |
| `naming.mdc`      | 命名规范、Props 设计、事件命名、API 规范  | 所有代码文件    | ✅       |
| `testing.mdc`     | 测试框架、覆盖率要求、测试编写规范        | 测试文件        | ❌       |
| `docs.mdc`        | 文档结构、Changelog 规范、API 文档格式    | 文档文件        | ❌       |
| `git.mdc`         | 分支管理、提交规范、PR 流程               | 所有文件        | ✅       |
| `performance.mdc` | 性能优化、代码分割、监控分析              | 所有代码文件    | ❌       |

## 🎯 使用指南

### 开发阶段

1. **项目背景** (`project.mdc`) - 了解项目结构和技术栈
2. **命名规范** (`naming.mdc`) - 遵循统一的命名约定
3. **TypeScript 规范** (`typescript.mdc`) - 编写类型安全的代码
4. **Git 规范** (`git.mdc`) - 遵循版本控制流程

### 测试阶段

1. **测试规范** (`testing.mdc`) - 编写高质量的测试用例
2. **性能优化** (`performance.mdc`) - 确保代码性能

### 文档阶段

1. **文档规范** (`docs.mdc`) - 编写清晰的文档和 Changelog

## 🔧 规则配置

### 自动应用规则

以下规则会在所有相关文件中自动应用：

- 项目背景和基本规范
- 命名规范
- Git 工作流程

### 按需应用规则

以下规则需要手动指定或在特定文件中应用：

- TypeScript 规范
- 测试规范
- 文档规范
- 性能优化规范

## 📝 规则更新

### 添加新规则

1. 在 `.cursor/rules/` 目录下创建新的 `.mdc` 文件
2. 在文件头部添加 YAML 前置元数据
3. 更新本 README 文件

### 修改现有规则

1. 直接编辑对应的 `.mdc` 文件
2. 确保修改符合项目需求
3. 通知团队成员规则变更

### 规则文件格式

```yaml
---
description: 规则描述
globs: ['**/*.ts', '**/*.tsx'] # 适用的文件模式
alwaysApply: true # 是否自动应用
---
```

## 🚀 最佳实践

### 开发流程

1. 在开始开发前，确保了解相关规则
2. 使用 Cursor 的 AI 助手时，引用相应的规则文件
3. 定期检查和更新规则文件

### 团队协作

1. 所有团队成员都应该了解这些规则
2. 在代码审查中检查规则遵循情况
3. 定期讨论和优化规则内容

### 持续改进

1. 收集团队反馈，优化规则内容
2. 关注行业最佳实践，更新规则
3. 根据项目发展调整规则优先级

## 📚 相关资源

- [Cursor 官方文档](https://cursor.sh/docs)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [React 官方文档](https://react.dev/)
- [Vitest 官方文档](https://vitest.dev/)

## 🤝 贡献指南

如果您发现规则中的问题或有改进建议，请：

1. 创建 Issue 描述问题或建议
2. 提交 Pull Request 进行修改
3. 确保修改符合项目整体规范
4. 更新相关文档

---

_最后更新：2024 年 1 月_
