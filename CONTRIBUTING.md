# 贡献指南

感谢您对 Zeus 项目的关注！我们欢迎所有形式的贡献，包括但不限于：

- 🐛 Bug 报告
- 🚀 新功能建议
- 📝 文档改进
- 💻 代码贡献
- 🧪 测试用例
- 📦 包管理优化

## 🚀 快速开始

### 环境要求

- Node.js >= 20.0.0
- pnpm >= 10.0.0
- Git

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/your-org/zeus.git
cd zeus

# 安装依赖
pnpm install
```

### 开发命令

```bash
# 开发模式
pnpm dev

# 构建
pnpm build

# 测试
pnpm test

# 代码检查
pnpm lint

# 格式化
pnpm format

# 类型检查
pnpm check
```

## 📋 开发流程

### 1. 创建分支

从 `master` 分支创建新的功能分支：

```bash
git checkout master
git pull origin master
git checkout -b feat/your-feature-name
```

### 2. 分支命名规范

- 功能开发：`feat/description-of-feature`
- 问题修复：`fix/issue-number-or-description`
- 文档更新：`docs/what-is-changed`
- 代码重构：`refactor/what-is-changed`
- 样式修改：`style/what-is-changed`
- 测试相关：`test/what-is-changed`
- 构建相关：`build/what-is-changed`
- 性能优化：`perf/what-is-changed`

### 3. 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

类型包括：

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

示例：

```
feat(compiler): add support for custom directives

Add ability to define custom directives in Zeus templates
that can be processed during compilation phase.

Closes #123
```

### 4. 代码规范

- 使用 TypeScript 进行类型检查
- 遵循 ESLint 规则
- 使用 Prettier 进行代码格式化
- 编写单元测试
- 添加必要的注释和文档

### 5. 测试

在提交 PR 之前，请确保：

```bash
# 运行所有测试
pnpm test

# 检查代码质量
pnpm lint

# 检查类型
pnpm check

# 构建项目
pnpm build
```

## 🔄 Pull Request 流程

### 1. 创建 PR

- 使用项目提供的 PR 模板
- 填写详细的改动说明
- 关联相关的 Issue
- 添加必要的标签

### 2. PR 标题格式

```
[组件名]: 描述
```

示例：

```
[Compiler]: Add support for custom directives
[Runtime]: Fix memory leak in event handling
[Docs]: Update installation guide
```

### 3. PR 内容要求

- 清晰描述改动内容
- 提供测试用例
- 更新相关文档
- 确保 CI 检查通过

### 4. 代码审查

- 至少需要一名维护者审查
- 解决所有审查意见
- 确保代码质量符合标准

## 🏗️ 项目结构

```
zeus/
├── packages/
│   ├── compiler/     # 编译器包
│   ├── runtime/      # 运行时包
│   ├── components/   # 组件库
│   └── wc/          # Web Components
├── tools/           # 构建工具
├── docs/           # 文档
└── examples/       # 示例代码
```

## 🧪 测试指南

### 单元测试

```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
pnpm test --filter @zeus/compiler

# 运行测试并生成覆盖率报告
pnpm test-coverage
```

### 集成测试

```bash
# 运行集成测试
pnpm test-integration
```

### E2E 测试

```bash
# 运行端到端测试
pnpm test-e2e
```

## 📝 文档贡献

### 文档结构

- `README.md`: 项目介绍和快速开始
- `docs/`: 详细文档
- `examples/`: 示例代码
- `CHANGELOG.md`: 更新日志

### 文档规范

- 使用 Markdown 格式
- 提供中英文版本
- 包含代码示例
- 保持文档更新

## 🐛 Bug 报告

### 报告模板

使用 GitHub Issue 模板报告 Bug：

1. 选择 "Bug Report" 模板
2. 填写详细的重现步骤
3. 提供环境信息
4. 添加相关截图或日志

### 信息要求

- 清晰的 Bug 描述
- 重现步骤
- 期望行为
- 实际行为
- 环境信息
- 相关代码

## 🚀 功能请求

### 请求模板

使用 GitHub Issue 模板提出功能请求：

1. 选择 "Feature Request" 模板
2. 描述功能需求
3. 说明使用场景
4. 提供设计建议

### 评估标准

- 功能价值
- 实现复杂度
- 用户需求
- 技术可行性

## 🤝 社区准则

### 行为准则

- 保持友善和尊重
- 欢迎不同观点
- 提供建设性反馈
- 帮助其他贡献者

### 沟通渠道

- GitHub Issues: Bug 报告和功能请求
- GitHub Discussions: 一般讨论
- Pull Requests: 代码审查

## 📞 获取帮助

如果您在贡献过程中遇到问题：

1. 查看现有文档
2. 搜索相关 Issue
3. 在 Discussions 中提问
4. 联系维护者

## 🏆 贡献者

感谢所有为 Zeus 项目做出贡献的开发者！

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

---

再次感谢您的贡献！🎉
