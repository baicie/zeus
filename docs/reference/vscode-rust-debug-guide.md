# VSCode 调试 Rust 程序指南

> 本文档介绍如何在 VSCode 中调试 Rust 程序，包括配置、项目中的实际应用示例。

---

## 目录

- [1. 环境准备](#1-环境准备)
- [2. 安装必要扩展](#2-安装必要扩展)
- [3. 配置 launch.json](#3-配置-launchjson)
- [4. 配置 tasks.json](#4-配置-tasksjson)
- [5. 使用 CodeLLDB 调试](#5-使用-codelldb-调试)
- [6. 使用 rust-analyzer 调试](#6-使用-rust-analyzer-调试)
- [7. 调试 NAPI-RS (Node.js 原生模块)](#7-调试-napi-rs-node-js-原生模块)
- [8. 常见问题](#8-常见问题)

---

## 1. 环境准备

### 1.1 系统要求

- **Rust**: 版本 >= 1.70.0
- **VSCode**: 最新版本
- **操作系统**: macOS / Linux / Windows

### 1.2 安装 Rust 工具链

```bash
# 安装 Rust (如果你还没有)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 验证安装
rustc --version
cargo --version

# 确保有调试符号支持 (macOS)
brew install lldb
```

### 1.3 开启调试符号

编辑 `Cargo.toml`，为需要调试的 crate 启用 debug 配置：

```toml
[profile.dev]
opt-level = 0        # 不优化，保留调试信息
debug = true         # 生成调试符号
split-debuginfo = "unpacked"  # macOS 需要这行

[profile.release]
debug = true         # Release 模式也可以带调试信息
```

---

## 2. 安装必要扩展

在 VSCode 扩展市场安装以下扩展：

| 扩展名称 | 功能 | 必需 |
|---------|------|------|
| **rust-analyzer** | Rust 语言支持、LSP | 是 |
| **CodeLLDB** | LLDB 调试器 | 是 |
| **Rust Analyzer** | 另一种 Rust 支持 | 否 |
| **Even Better TOML** | TOML 文件支持 | 否 |

### 2.1 安装 CodeLLDB

1. 在 VSCode 中按 `Cmd+Shift+X` (macOS) 或 `Ctrl+Shift+X` (Windows/Linux)
2. 搜索 "CodeLLDB"
3. 点击安装

### 2.2 配置 rust-analyzer

在 `.vscode/settings.json` 中添加：

```json
{
  "rust-analyzer.checkOnSave.command": "clippy",
  "rust-analyzer.cargo.loadOutDirsFromCheck": true,
  "rust-analyzer.procMacro.enable": true
}
```

---

## 3. 配置 launch.json

### 3.1 基本配置

按 `Cmd+Shift+D` 打开调试面板，点击 "create a launch.json file"，选择 "Rust"。

VSCode 会自动生成基本的调试配置。

### 3.2 手动创建配置

在 `.vscode/launch.json` 中添加：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Debug current crate",
      "cargo": {
        "args": "build",
        "filter": {
          "package": "${workspaceFolderBasename}"
        }
      },
      "program": "${workspaceFolder}/target/debug/${workspaceFolderBasename}"
    },
    {
      "type": "lldb",
      "request": "launch",
      "name": "Debug with args",
      "cargo": {
        "args": "build"
      },
      "program": "${workspaceFolder}/target/debug/my-binary",
      "args": ["--arg1", "value1"]
    }
  ]
}
```

### 3.3 高级配置选项

```json
{
  "type": "lldb",
  "request": "launch",
  "name": "Advanced Debug",
  "cargo": {
    "args": "build",
    "filter": {
      "package": "zeus-compiler-core"
    }
  },
  "program": "${workspaceFolder}/target/debug/zeus-compiler-core",
  "args": ["--input", "example.jsx"],
  "env": {
    "RUST_LOG": "debug",
    "RUST_BACKTRACE": "1"
  },
  "cwd": "${workspaceFolder}",
  "preLaunchTask": "cargo build",
  "sourceLanguages": ["rust"]
}
```

---

## 4. 配置 tasks.json

### 4.1 添加 Cargo 任务

在 `.vscode/tasks.json` 中：

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "cargo build debug",
      "type": "shell",
      "command": "cargo",
      "args": ["build"],
      "group": "build",
      "problemMatcher": ["$rustc"]
    },
    {
      "label": "cargo build release",
      "type": "shell",
      "command": "cargo",
      "args": ["build", "--release"],
      "group": "build",
      "problemMatcher": ["$rustc"]
    },
    {
      "label": "cargo test debug",
      "type": "shell",
      "command": "cargo",
      "args": ["test"],
      "group": "test",
      "problemMatcher": ["$rustc"]
    }
  ]
}
```

---

## 5. 使用 CodeLLDB 调试

### 5.1 设置断点

1. 在代码行号左侧点击设置断点（红点）
2. 使用条件断点：右键点击断点 → Edit Condition
3. 使用监视点：右键断点 → Edit Watch Expression

### 5.2 调试面板功能

| 按钮 | 功能 |
|------|------|
| ⏵ Continue / Pause | 继续执行 / 暂停 |
| ⏭ Step Over | 单步跳过 (不进入函数) |
| ⏺️ Step Into | 单步进入 (进入函数) |
| ⏹ Step Out | 跳出当前函数 |
| 🔄 Restart | 重新开始调试 |
| ⏹ Stop | 停止调试 |

### 5.3 调试控制台

在调试时打开调试控制台 (`View → Debug Console`)：

```
# 查看变量
frame variable

# 打印变量
p variable_name

# 调用 Rust 函数
expr some_function()

# 打印类型
ptype variable_name
```

---

## 6. 使用 rust-analyzer 调试

### 6.1 启动调试

1. 将光标放在 `fn` 定义上
2. 按 `F5` 或点击调试按钮
3. rust-analyzer 会自动生成调试配置

### 6.2 调试测试

```json
{
  "type": "lldb",
  "request": "launch",
  "name": "Debug test",
  "cargo": {
    "args": "test",
    "filter": {
      "package": "zeus-compiler-core",
      "test": "test_parser"
    }
  },
  "program": "${workspaceFolder}/target/debug/deps/zeus_compiler_core-[hash]",
  "args": []
}
```

### 6.3 调试特定测试用例

```json
{
  "type": "lldb",
  "request": "launch",
  "name": "Debug test: test_name",
  "cargo": {
    "args": "test",
    "filter": {
      "package": "zeus-compiler-core",
      "test": "test_name"
    }
  }
}
```

---

## 7. 调试 NAPI-RS (Node.js 原生模块)

本项目使用 NAPI-RS 绑定 Rust 和 JavaScript，调试方式略有不同。

### 7.1 调试 Rust NAPI 代码

```json
{
  "type": "lldb",
  "request": "launch",
  "name": "Debug NAPI-RS (Rust)",
  "cargo": {
    "args": "build --features debug"
  },
  "program": "node",
  "args": ["${workspaceFolder}/playground/example.js"],
  "env": {
    "RUST_BACKTRACE": "full",
    "DEBUG_NAPI": "1"
  },
  "cwd": "${workspaceFolder}"
}
```

### 7.2 同时调试 Rust 和 TypeScript

1. **第一步**：在 Rust 代码中设置断点
2. **第二步**：在 TypeScript 代码中设置断点
3. **第三步**：启动复合调试配置

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Rust Debug",
      "cargo": {
        "args": "build"
      }
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Node Debug",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["tsx", "playground/example.ts"],
      "console": "integratedTerminal"
    }
  ],
  "compounds": [
    {
      "name": "Debug Both",
      "configurations": ["Rust Debug", "Node Debug"]
    }
  ]
}
```

### 7.3 环境变量配置

在 `playground/.env` 中配置：

```env
RUST_LOG=debug
RUST_BACKTRACE=1
NODE_OPTIONS="--loader ts-node/esm"
```

### 7.4 调试 NAPI-RS 示例

对于 `zeusjs_binding` crate 的调试：

```json
{
  "type": "lldb",
  "request": "launch",
  "name": "Debug zeusjs_binding",
  "cargo": {
    "args": "build",
    "filter": {
      "package": "zeusjs-binding"
    }
  },
  "program": "node",
  "args": [
    "-e",
    "const zeus = require('./packages/zeus-js'); zeus.parse('<div>test</div>');"
  ],
  "env": {
    "RUST_BACKTRACE": "full",
    "RUST_LOG": "zeus_compiler=debug"
  },
  "preLaunchTask": "cargo build"
}
```

---

## 8. 常见问题

### 8.1 断点不生效

**问题**：断点显示为灰色而非红色

**解决方案**：

```bash
# 1. 确保是 debug 构建
cargo build

# 2. 检查是否生成了调试符号
ls -la target/debug/*.dSYM 2>/dev/null || echo "No dSYM found"

# 3. macOS 需要设置
cargo build # 默认是 debug 模式
```

### 8.2 找不到程序

**问题**：`Could not find configuration`。

**解决方案**：检查 `launch.json` 中的路径：

```json
{
  "program": "${workspaceFolder}/target/debug/${workspaceFolderBasename}"
}
```

如果二进制名称与 workspace 名称不同，手动指定：

```json
{
  "program": "${workspaceFolder}/target/debug/zeus-compiler"
}
```

### 8.3 LLDB 扩展无法加载

**问题**：CodeLLDB 扩展报错

**解决方案**：

```bash
# macOS: 安装命令行开发者工具
xcode-select --install

# 验证 lldb 可用
lldb --version
```

### 8.4 变量显示不正确

**问题**：调试时变量值为 `<optimized out>`

**解决方案**：确保 `Cargo.toml` 中：

```toml
[profile.dev]
opt-level = 0
debug = true
```

### 8.5 调试 release 构建

```json
{
  "type": "lldb",
  "request": "launch",
  "name": "Debug Release",
  "cargo": {
    "args": "build --release"
  },
  "program": "${workspaceFolder}/target/release/${workspaceFolderBasename}"
}
```

> 注意：release 优化的代码可能与源代码不完全对应

### 8.6 附加到运行中的进程

```json
{
  "type": "lldb",
  "request": "attach",
  "name": "Attach to Process",
  "pid": "${command:pickProcess}"
}
```

### 8.7 使用 printf 调试

在 Rust 代码中临时添加日志：

```rust
eprintln!("Debug: variable = {:?}", variable);
```

运行时不使用调试器也能看到输出：

```bash
cargo run 2>&1 | grep "Debug:"
```

---

## 快速参考

### 常用快捷键

| 操作 | macOS | Windows/Linux |
|------|-------|---------------|
| 开始调试 | `F5` | `F5` |
| 停止调试 | `Shift+F5` | `Shift+F5` |
| 单步跳过 | `F10` | `F10` |
| 单步进入 | `F11` | `F11` |
| 跳出函数 | `Shift+F11` | `Shift+F11` |
| 切换断点 | `F9` | `F9` |

### LLDB 命令速查

| 命令 | 作用 |
|------|------|
| `p variable` | 打印变量值 |
| `po variable` | 打印对象描述 |
| `bt` | 显示调用栈 |
| `frame select N` | 切换到第 N 帧 |
| `watchpoint set variable name` | 设置监视点 |
| `b file.rs:10` | 在 file.rs 第 10 行设置断点 |
| `c` | 继续执行 |
| `n` | 单步跳过 |
| `s` | 单步进入 |

---

## 参考资源

- [CodeLLDB 官方文档](https://github.com/vadimcn/vscode-lldb/blob/master/MANUAL.md)
- [rust-analyzer 配置](https://rust-analyzer.github.io/manual.html)
- [Rust 调试指南](https://rustwiki.org/zh-CN/book/ch15-00-debugging.html)
- [LLDB 命令参考](https://lldb.llvm.org/use/map.html)
