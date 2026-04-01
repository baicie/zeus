# OXC SourceMap 生成方案

## 概述

本文档描述 Zeus 编译器如何使用 oxc 生态提供的 `oxc_codegen` 和 `oxc_sourcemap` crate 来生成 SourceMap，实现编译产物与原始源代码之间的位置映射。

SourceMap 是一种 JSON 格式的调试信息文件，遵循 [Source Map Revision 3 规范](https://sourcemaps.info/spec.html)，用于将压缩/转换后的代码映射回原始源代码位置，在浏览器开发者工具中实现源码级调试。

## 1. 技术背景

### 1.1 Source Map 规范

Source Map v3 的核心结构如下：

```json
{
  "version": 3,                    // 规范版本
  "file": "output.js",             // 输出文件名
  "sources": ["input.tsx"],        // 源文件列表
  "sourceRoot": "",                // 源文件根路径
  "sourcesContent": [null],        // 源代码内容（可选）
  "names": [],                     // 标识符名称列表
  "mappings": "AAAA,OAAO,..."      // VLQ 编码的映射数据
}
```

**mappings 字段**是 SourceMap 的核心，采用 VLQ（Variable Length Quantity）编码，包含以下信息：

| 字段 | 说明 |
|------|------|
| 生成代码列偏移 | 生成代码列相对于上一个 token 的增量 |
| 源文件索引 | 引用 sources 数组中的哪个源文件 |
| 源文件行号 | 原始代码的行号 |
| 源文件列号 | 原始代码的列号 |
| 名称索引 | 引用 names 数组中的标识符名称（可选）|

### 1.2 oxc_sourcemap crate

`oxc_sourcemap` 是 oxc 项目维护的 SourceMap 处理库，基于 rust-sourcemap fork 并针对 oxc 进行了优化。主要提供以下功能：

| 类型/方法 | 说明 |
|-----------|------|
| `SourceMapBuilder` | 用于构建 SourceMap 的辅助类 |
| `SourceMap` | 核心 SourceMap 数据结构 |
| `JSONSourceMap` | 符合 Source Map v3 规范的 JSON 结构 |
| `SourceMapBuilder::add_token()` | 添加单个映射 token |
| `SourceMapBuilder::set_source_and_content()` | 设置源文件和内容 |
| `SourceMap::to_json_string()` | 序列化为 JSON 字符串 |
| `SourceMap::to_data_url()` | 转换为 data URL（用于 inline sourcemap）|

## 2. oxc_codegen 内置 SourceMap 支持

### 2.1 架构概览

`oxc_codegen` 已在代码生成流程中内置了 SourceMap 生成能力。核心流程如下：

```
输入源代码 → Parser → AST → Transformer → CodeGen + SourceMapBuilder → 输出代码 + SourceMap
```

### 2.2 核心组件

#### CodegenOptions

`CodegenOptions` 是代码生成的可配置选项，其中 `source_map_path` 字段控制 SourceMap 生成：

```rust
pub struct CodegenOptions {
    pub single_quote: bool,           // 是否使用单引号
    pub minify: bool,                 // 是否压缩
    pub comments: CommentOptions,      // 注释处理选项
    pub source_map_path: Option<PathBuf>,  // SourceMap 源文件路径
    pub indent_char: IndentChar,       // 缩进字符
    pub indent_width: usize,          // 缩进宽度
    pub initial_indent: u32,          // 初始缩进级别
}
```

**关键行为**：
- 当 `source_map_path` 为 `Some(path)` 时，启用 SourceMap 生成
- 当 `source_map_path` 为 `None` 时，不生成 SourceMap，`CodegenReturn.map` 为 `None`

#### CodegenReturn

`Codegen::build()` 返回 `CodegenReturn` 结构：

```rust
#[non_exhaustive]
pub struct CodegenReturn {
    pub code: String,                          // 生成的代码
    pub map: Option<SourceMap>,               // SourceMap（可选）
    pub legal_comments: Vec<Comment>,          // 许可证注释
}
```

#### SourceMap 结构

oxc 的 `SourceMap` 结构包含以下字段：

```rust
pub struct SourceMap {
    file: Option<Arc<str>>,                    // 文件名
    names: Vec<Arc<str>>,                      // 标识符名称列表
    source_root: Option<String>,                // 源文件根路径
    sources: Vec<Arc<str>>,                     // 源文件列表
    source_contents: Vec<Option<Arc<str>>>,    // 源代码内容
    tokens: Box<[Token]>,                       // 映射 token 列表
    token_chunks: Option<Vec<TokenChunk>>,     // 并行 VLQ 编码优化
    x_google_ignore_list: Option<Vec<u32>>,   // 第三方源码标记
    debug_id: Option<String>,                  // 调试 ID
}
```

### 2.3 SourceMap 生成流程

#### 初始化阶段

当 `CodegenOptions::source_map_path` 被设置时，`Codegen::build` 会创建 `SourcemapBuilder`：

```rust
impl<'a> Codegen<'a> {
    pub fn build(self, program: &Program<'a>) -> CodegenReturn {
        // 如果设置了 source_map_path，创建 SourceMapBuilder
        if let Some(source_map_path) = self.options.source_map_path {
            self.sourcemap_builder = Some(
                SourceMapBuilder::new(source_map_path, source_text)
            );
        }
        // ... 遍历 AST 生成代码
    }
}
```

#### 映射记录阶段

在代码生成过程中，每当输出关键位置（语句开始、函数声明、类声明等），会调用 `add_source_mapping()` 记录映射：

| AST 节点类型 | 映射位置 | 示例 |
|-------------|---------|------|
| Statement | 语句开始 | 变量声明、表达式语句 |
| Directive | 指令开始 | `"use strict"` |
| Function | function 关键字 | 函数声明/表达式 |
| Class | class 关键字 | 类声明 |
| ExpressionStatement | 表达式开始 | 顶层表达式 |

#### Token 结构

映射的每个 token 包含源到目标的位置映射：

```rust
pub struct Token {
    pub dst_line: u32,       // 生成代码行号
    pub dst_col: u32,        // 生成代码列号
    pub src_line: u32,      // 源文件行号
    pub src_col: u32,       // 源文件列号
    pub src_id: Option<u32>, // 源文件索引
    pub name_id: Option<u32>, // 标识符名称索引
}
```

### 2.4 VLQ 编码

SourceMap 使用 VLQ（Variable Length Quantity）编码来压缩 mappings 字段。VLQ 编码将整数值转换为可变长度的 base64 字符串。

oxc 实现的 VLQ 编码支持负数（通过符号位）和高效的差分编码（每个值只存储相对于前一个值的增量）。

## 3. Zeus 编译器集成方案

### 3.1 依赖配置

确保在 `Cargo.toml` 中配置了正确的依赖：

```toml
[workspace.dependencies]
# oxc codegen（默认启用 sourcemap feature）
oxc_codegen = { version = "0.123.0" }

# oxc sourcemap（显式声明）
oxc_sourcemap = { version = "6" }
```

### 3.2 编译结果类型

建议定义统一的编译结果结构，包含代码和 SourceMap：

```rust
// 在 zeus_compiler_common 或核心编译器模块中定义
pub struct CompileResult {
    /// 编译后的代码
    pub code: String,
    /// SourceMap JSON 字符串（可选）
    pub map: Option<String>,
    /// 错误信息（如果有）
    pub error: Option<String>,
}

impl CompileResult {
    /// 成功结果
    pub fn success(code: String, map: Option<String>) -> Self {
        Self { code, map, error: None }
    }

    /// 失败结果
    pub fn error(msg: String) -> Self {
        Self { code: String::new(), map: None, error: Some(msg) }
    }

    /// 是否有错误
    pub fn is_ok(&self) -> bool {
        self.error.is_none()
    }

    /// 是否包含 SourceMap
    pub fn has_sourcemap(&self) -> bool {
        self.map.is_some()
    }
}
```

### 3.3 Codegen 集成

#### 使用 oxc_codegen 生成 SourceMap

```rust
use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_span::SourceType;
use std::path::PathBuf;

/// 编译并生成 SourceMap
pub fn compile_with_sourcemap(
    source: &str,
    source_file: &str,
    enable_sourcemap: bool,
) -> CompileResult {
    let allocator = Allocator::default();
    let source_type = SourceType::tsx();

    // 解析源代码
    let ret = oxc_parser::Parser::new(&allocator, source, source_type).parse();
    if !ret.errors.is_empty() {
        let error = ret.errors[0].message.clone();
        return CompileResult::error(error);
    }

    let program = ret.program;

    // 配置代码生成选项
    let options = if enable_sourcemap {
        CodegenOptions {
            source_map_path: Some(PathBuf::from(source_file)),
            ..CodegenOptions::default()
        }
    } else {
        CodegenOptions::default()
    };

    // 生成代码和 SourceMap
    let result = Codegen::new()
        .with_options(options)
        .with_source_text(source)
        .build(&program);

    let map = result.map.map(|sm| sm.to_json_string());

    CompileResult::success(result.code, map)
}
```

#### Zeus 编译器整合

当前 Zeus 编译器使用自定义的模板生成逻辑，需要在适当位置集成 SourceMap 支持：

```rust
/// Zeus 编译函数
pub fn compile(source: &str, options: CompilerOptions) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = options.source_type_from_str();

    // 解析
    let program = crate::parser::parse_with_allocator(&allocator, source, &source_type)?;

    // 语义分析
    let semantic_ret = SemanticBuilder::new().build(&program);
    let scoping = semantic_ret.semantic.scoping();

    // 遍历转换
    let mut pass = DomCompilerPass::new(source, options.clone());
    let initial_state = DomCompilerState::new();
    traverse_mut(&mut pass, &allocator, &mut program, scoping, initial_state);

    // 生成代码
    let code = generate_code(&pass.state, source);

    Ok(code)
}

/// 生成代码（示例，可根据实际需求调整）
fn generate_code(state: &DomCompilerState, source: &str) -> String {
    let mut output = String::new();

    // 生成 import 语句
    if !state.used_helpers.is_empty() {
        output.push_str("import { ");
        output.push_str(&state.used_helpers.join(", "));
        output.push_str(" } from \"@zeus-js/core\";\n\n");
    }

    // 生成模板声明
    for template in &state.templates {
        let escaped_html = escape_template_html(&template.html);
        output.push_str(&format!(
            "const {} = template(\"{}\");\n",
            template.name, escaped_html
        ));

        // 生成 insert 调用
        for binding in &template.child_bindings {
            output.push_str(&format!(
                "insert({}, {}, null);\n",
                template.name, binding.expression
            ));
        }
    }

    // 生成事件委托
    if !state.delegated_events.is_empty() {
        output.push_str("delegateEvents([");
        output.push_str(
            &state.delegated_events
                .iter()
                .map(|e| format!("\"{}\"", e))
                .collect::<Vec<_>>()
                .join(", ")
        );
        output.push_str("]);\n");
    }

    output
}
```

### 3.4 SourceMap 生成策略

根据 Zeus 编译器的特点，建议采用以下 SourceMap 生成策略：

#### 策略一：使用 oxc_codegen 内置 SourceMap（推荐）

优点：
- oxc 团队维护，经过充分测试
- 性能优化，使用 token_chunks 支持并行 VLQ 编码
- 自动处理 AST 节点位置信息

缺点：
- 需要将 Zeus 模板 IR 转换为标准 ESTree AST
- 模板声明和运行时调用需要额外处理

#### 策略二：自定义 SourceMapBuilder（当前实现）

当前 Zeus 编译器已有一个简化版的 `SourceMapBuilder`：

```rust
pub struct SourceMapBuilder {
    sources: Vec<String>,
    mappings: Vec<SourceMapping>,
}

pub struct SourceMapping {
    pub generated: (u32, u32),
    pub original: (u32, u32),
    pub source_index: usize,
    pub name: Option<String>,
}
```

这种实现适合 Zeus 的模板生成模式，但需要增强以支持：
- VLQ 编码优化
- sourcesContent 支持
- 与外部构建工具（Vite/Rolldown）集成

## 4. NAPI 绑定层集成

### 4.1 编译结果类型

在 NAPI 绑定层扩展 `CompileResult` 以包含 SourceMap：

```rust
// 在 crates/zeusjs_binding/src/lib.rs 中

use serde::{Deserialize, Serialize};

/// 编译结果（含 SourceMap 支持）
#[derive(Debug, Serialize)]
#[napi(object)]
pub struct CompileResultWithSourcemap {
    /// 是否成功
    pub success: bool,
    /// 生成的代码
    pub code: String,
    /// SourceMap JSON 字符串
    #[serde(skip_serializing_if = "Option::is_none")]
    pub map: Option<String>,
    /// 错误信息（如果有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl From<Result<String, String>> for CompileResultWithSourcemap {
    fn from(result: Result<String, String>) -> Self {
        match result {
            Ok(code) => CompileResultWithSourcemap {
                success: true,
                code,
                map: None,
                error: None,
            },
            Err(e) => CompileResultWithSourcemap {
                success: false,
                code: String::new(),
                map: None,
                error: Some(e),
            },
        }
    }
}

/// 带 SourceMap 的编译选项
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[napi(object)]
pub struct CompileOptions {
    /// 源代码
    pub source: String,
    /// 源文件名
    #[serde(default)]
    pub source_file: Option<String>,
    /// 是否启用 SourceMap
    #[serde(default = "default_sourcemap")]
    pub sourcemap: bool,
    /// 其他编译选项...
}

fn default_sourcemap() -> bool {
    true  // 开发模式下默认启用
}

/// 带 SourceMap 的编译函数
#[napi]
pub fn compile_with_sourcemap(options: CompileOptions) -> Result<CompileResultWithSourcemap> {
    let CompileOptions {
        source,
        source_file,
        sourcemap,
        ..
    } = options;

    let file = source_file.unwrap_or_else(|| "input.tsx".to_string());

    let result = zeus_compiler_dom::compile_with_sourcemap(&source, &file, sourcemap)
        .map_err(|e| napi::Error::from_reason(e));

    match result {
        Ok(compiled) => Ok(CompileResultWithSourcemap {
            success: true,
            code: compiled.code,
            map: compiled.map,
            error: None,
        }),
        Err(e) => Ok(CompileResultWithSourcemap {
            success: false,
            code: String::new(),
            map: None,
            error: Some(e.to_string()),
        }),
    }
}
```

### 4.2 TypeScript 接口

生成的 TypeScript 接口示例：

```typescript
// packages/compiler-core/src/types.ts

export interface CompileResult {
  success: boolean;
  code: string;
  map?: string;  // SourceMap JSON
  error?: string;
}

export interface CompileOptions {
  source: string;
  sourceFile?: string;
  sourcemap?: boolean;
  // ... 其他选项
}

export interface SourceMap {
  version: 3;
  file?: string;
  sources: string[];
  sourceRoot?: string;
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}
```

## 5. 高级特性

### 5.1 合并多个 SourceMap

当编译过程涉及多个阶段（如 JSX 转换 → Babel 插件 → Minification）时，需要合并各阶段的 SourceMap。

oxc 提供 `ConcatSourceMapBuilder`：

```rust
use oxc_sourcemap::ConcatSourceMapBuilder;

pub fn concat_sourcemaps(sourcemaps: Vec<SourceMap>) -> SourceMap {
    let mut builder = ConcatSourceMapBuilder::new();

    for sm in sourcemaps {
        builder.add_sourcemap(&sm);
    }

    builder.into_sourcemap()
}
```

### 5.2 sourcesContent 内联

sourcesContent 字段允许在 SourceMap 中直接包含源代码内容，便于在没有源文件的情况下进行调试：

```rust
impl SourceMap {
    /// 设置源文件内容
    pub fn set_source_contents(&mut self, source_contents: Vec<Option<&str>>) {
        self.source_contents =
            source_contents.into_iter().map(|v| v.map(Arc::from)).collect();
    }

    /// 获取源文件内容
    pub fn get_source_content(&self, id: u32) -> Option<&Arc<str>> {
        self.source_contents.get(id as usize).and_then(|item| item.as_ref())
    }
}
```

### 5.3 x-google-ignore-list 支持

用于标记第三方源码（如框架代码、构建工具生成的代码），使浏览器自动将其加入忽略列表：

```rust
impl SourceMap {
    /// 设置忽略列表
    pub fn set_x_google_ignore_list(&mut self, indices: Vec<u32>) {
        self.x_google_ignore_list = Some(indices);
    }

    /// 获取忽略列表
    pub fn get_x_google_ignore_list(&self) -> Option<&[u32]> {
        self.x_google_ignore_list.as_deref()
    }
}
```

### 5.4 Debug ID

支持 Sentry 等错误追踪工具的唯一标识符：

```rust
impl SourceMap {
    pub fn set_debug_id(&mut self, debug_id: &str) {
        self.debug_id = Some(debug_id.into());
    }

    pub fn get_debug_id(&self) -> Option<&str> {
        self.debug_id.as_deref()
    }
}
```

## 6. SourceMap 验证与测试

### 6.1 Stack Trace 验证

oxc 通过生成包含错误的测试代码并验证错误栈追踪来验证 SourceMap 正确性：

```rust
#[test]
fn test_sourcemap_stacktrace() {
    let source = r#"
        function foo() {
            throw new Error("test");
        }
        foo();
    "#;

    // 生成带 SourceMap 的代码
    let result = Codegen::new()
        .with_options(CodegenOptions {
            source_map_path: Some(PathBuf::from("test.ts")),
            ..CodegenOptions::default()
        })
        .with_source_text(source)
        .build(&program);

    // 将代码和 SourceMap 写入临时文件
    let temp_dir = tempfile::tempdir().unwrap();
    let js_path = temp_dir.path().join("test.js");
    let map_path = temp_dir.path().join("test.js.map");

    std::fs::write(&js_path, &result.code).unwrap();
    std::fs::write(&map_path, result.map.unwrap().to_json_string()).unwrap();

    // 添加 source map 注释
    let mut code_with_comment = result.code;
    code_with_comment.push_str(&format!("\n//# sourceMappingURL={}\n", map_path.file_name().unwrap().to_str().unwrap()));
    std::fs::write(&js_path, &code_with_comment).unwrap();

    // 在 Node.js 中执行并检查 stack trace
    let output = Command::new("node")
        .arg(&js_path)
        .output()
        .expect("Failed to execute node");

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("test.ts:3"));  // 验证行号映射正确
}
```

### 6.2 Token 映射验证

验证特定代码位置是否正确映射：

```rust
#[test]
fn test_token_mapping() {
    let source = "const x = 1 + 2;";
    let program = parse(source);

    let result = Codegen::new()
        .with_options(CodegenOptions {
            source_map_path: Some(PathBuf::from("test.js")),
            ..CodegenOptions::default()
        })
        .with_source_text(source)
        .build(&program);

    let sourcemap = result.map.unwrap();
    let lookup_table = sourcemap.generate_lookup_table();

    // 查找生成代码位置 (0, 6) 对应的源位置
    if let Some(token) = sourcemap.lookup_source_view_token(&lookup_table, 0, 6) {
        assert_eq!(token.src_line, 0);
        assert_eq!(token.src_col, 6);  // "x" 的位置
    }
}
```

## 7. 最佳实践

### 7.1 开发与生产环境策略

| 环境 | SourceMap 策略 | 原因 |
|------|---------------|------|
| 开发 | 启用 + inline | 便于调试源码 |
| 生产 | 启用 + external | 减小包体积，便于生产环境错误追踪 |
| 构建时 | 启用 + separate file | 保持构建产物整洁 |

### 7.2 SourceMap 输出格式

```rust
/// SourceMap 输出模式
pub enum SourceMapMode {
    /// 不生成 SourceMap
    None,
    /// 生成外部 .map 文件
    External {
        /// SourceMap 文件路径
        path: PathBuf,
        /// 是否添加 sourceMappingURL 注释
        add_url_comment: bool,
    },
    /// 内联到代码末尾（data URL）
    Inline,
}

impl SourceMap {
    /// 根据模式输出
    pub fn output(&self, mode: &SourceMapMode, output_code: &str) -> String {
        match mode {
            SourceMapMode::None => output_code.to_string(),
            SourceMapMode::External { add_url_comment, .. } => {
                if *add_url_comment {
                    format!(
                        "{}\n//# sourceMappingURL={}",
                        output_code,
                        self.get_file().map(|f| format!("{}.map", f)).unwrap_or_default()
                    )
                } else {
                    output_code.to_string()
                }
            }
            SourceMapMode::Inline => {
                format!(
                    "{}\n//# sourceMappingURL={}",
                    output_code,
                    self.to_data_url()
                )
            }
        }
    }
}
```

### 7.3 性能优化

1. **Token Chunk 优化**：oxc 支持使用 `TokenChunk` 进行并行 VLQ 编码
2. **Lazy Serialization**：仅在需要时序列化 SourceMap
3. **条件编译**：使用 `#[cfg(feature = "sourcemap")]` 在不需要时排除相关代码

## 8. 迁移计划

### Phase 1：当前状态
- [x] 基础 SourceMapBuilder 实现（简化版）
- [x] 基本的 VLQ 编码
- [x] Codegen 集成

### Phase 2：短期目标
- [ ] 使用 oxc_codegen 内置 SourceMap
- [ ] NAPI 绑定支持 SourceMap 返回
- [ ] TypeScript 类型定义

### Phase 3：长期目标
- [ ] 支持 sourcesContent
- [ ] SourceMap 合并（多阶段编译）
- [ ] 完整的 stack trace 测试
- [ ] 与 Vite/Rolldown 集成

## 9. 参考资料

- [oxc_sourcemap 文档](https://docs.rs/oxc_sourcemap/latest/oxc_sourcemap/)
- [oxc_codegen 文档](https://docs.rs/oxc_codegen/latest/oxc_codegen/)
- [Source Map Revision 3 规范](https://sourcemaps.info/spec.html)
- [oxc 项目 GitHub](https://github.com/oxc-project/oxc)
- [VLQ 编码维基百科](https://en.wikipedia.org/wiki/Variable-length_quantity)
