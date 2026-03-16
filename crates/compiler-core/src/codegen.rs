//! 代码生成器模块

use crate::traverse::{AttrBindingKind, DomCompilerState, TemplateDecl};

/// SourceMap 生成器
#[derive(Default)]
pub struct SourceMapBuilder {
    /// 源文件
    sources: Vec<String>,
    /// 映射
    mappings: Vec<SourceMapping>,
}

/// SourceMap 映射
#[derive(Clone, Debug)]
pub struct SourceMapping {
    /// 生成代码中的位置（行，列）
    pub generated: (u32, u32),
    /// 原始代码中的位置（行，列）
    pub original: (u32, u32),
    /// 源文件索引
    pub source_index: usize,
    /// 原始名称（可选）
    pub name: Option<String>,
}

impl SourceMapBuilder {
    /// 创建新的 SourceMap 生成器
    pub fn new(source: &str) -> Self {
        Self {
            sources: vec![source.to_string()],
            mappings: Vec::new(),
        }
    }

    /// 添加映射
    pub fn add_mapping(&mut self, generated_line: u32, generated_col: u32, original_line: u32, original_col: u32) {
        self.mappings.push(SourceMapping {
            generated: (generated_line, generated_col),
            original: (original_line, original_col),
            source_index: 0,
            name: None,
        });
    }

    /// 生成 Base64 VLQ 编码的 mappings 字符串
    pub fn encode_mappings(&self) -> String {
        let mut result = String::new();
        let mut prev_generated_line = 0u32;
        let mut prev_generated_col = 0u32;
        let mut prev_original_line = 0u32;
        let mut prev_original_col = 0u32;

        for mapping in &self.mappings {
            let generated_line = mapping.generated.0;
            let generated_col = mapping.generated.1;
            let original_line = mapping.original.0;
            let original_col = mapping.original.1;

            // 行变化
            if generated_line > prev_generated_line {
                result.push_str(&";".repeat((generated_line - prev_generated_line) as usize));
                prev_generated_col = 0;
                prev_original_col = 0;
            }

            // 列变化
            let col_diff = (generated_col as i64 - prev_generated_col as i64) as i64;
            result.push_str(&Self::encode_vlq(col_diff));
            prev_generated_col = generated_col;

            // 源文件变化（总是 0）
            result.push_str(&Self::encode_vlq(0));

            // 原始行变化
            let orig_line_diff = (original_line as i64 - prev_original_line as i64) as i64;
            result.push_str(&Self::encode_vlq(orig_line_diff));
            prev_original_line = original_line;

            // 原始列变化
            let orig_col_diff = (original_col as i64 - prev_original_col as i64) as i64;
            result.push_str(&Self::encode_vlq(orig_col_diff));
            prev_original_col = original_col;

            result.push(',');
        }

        result
    }

    /// VLQ 编码
    fn encode_vlq(value: i64) -> String {
        let mut result = String::new();
        let mut v = value;

        if v < 0 {
            v = (-v) << 1 | 1;
        } else {
            v <<= 1;
        }

        loop {
            let mut digit = (v & 0x1F) as u32;
            v >>= 5;

            if v != 0 {
                digit |= 0x20;
            }

            result.push(Self::base64_encode(digit as u8));

            if v == 0 {
                break;
            }
        }

        result
    }

    /// Base64 编码
    fn base64_encode(value: u8) -> char {
        const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        CHARS[value as usize] as char
    }

    /// 生成 JSON
    pub fn to_json(&self, file_name: &str) -> String {
        format!(
            r#"{{
  "version": 3,
  "sources": ["{}"],
  "names": [],
  "mappings": "{}"
}}"#,
            file_name,
            self.encode_mappings()
        )
    }
}

/// 代码生成器
pub struct CodeGenerator {
    /// 当前缩进
    #[allow(dead_code)]
    indent: usize,
    /// 输出缓冲
    buffer: String,
    /// SourceMap 生成器
    #[allow(dead_code)]
    source_map: SourceMapBuilder,
    /// 当前行号
    current_line: u32,
    /// 当前列号
    current_col: u32,
    /// 原始源代码
    original_source: String,
}

impl CodeGenerator {
    /// 创建新的代码生成器
    pub fn new(source: &str) -> Self {
        Self {
            indent: 0,
            buffer: String::new(),
            source_map: SourceMapBuilder::new(source),
            current_line: 1,
            current_col: 0,
            original_source: source.to_string(),
        }
    }

    /// 从 AST 生成代码（带 sourcemap）
    pub fn generate_with_sourcemap(state: &DomCompilerState, source: &str) -> (String, String) {
        let mut generator = Self::new(source);

        // import helpers first
        generator.generate_imports(&state.used_helpers, "@zeus-js/core");

        // 生成模板声明和 insert 调用
        for template in &state.templates {
            generator.generate_template_with_inserts(template);
        }

        // 注册委托事件
        if !state.delegated_events.is_empty() && state.used_helpers.iter().any(|h| h == "delegateEvents") {
            generator.push_str("delegateEvents([");
            for (i, e) in state.delegated_events.iter().enumerate() {
                if i > 0 {
                    generator.push_str(", ");
                }
                generator.push_str("'");
                generator.push_str(e);
                generator.push_str("'");
            }
            generator.push_str("]);\n");
        }

        // 保留原始代码（AST已被修改）
        generator.push_str(source);

        generator.finish()
    }

    /// 从 AST 生成代码（无 sourcemap）
    pub fn generate(state: &DomCompilerState, source: &str) -> String {
        let (code, _) = Self::generate_with_sourcemap(state, source);
        code
    }

    /// 生成模板声明（含 insert 调用）
    pub fn generate_template_with_inserts(&mut self, decl: &TemplateDecl) {
        // 模板声明
        self.push_str("const ");
        self.push_str(&decl.name);
        self.push_str(" = template(\"");
        self.push_str(&decl.html);
        self.push_str("\");\n");

        // 如果有子节点绑定，生成 insert 调用
        if !decl.child_bindings.is_empty() {
            // insert(el, parent, expression)
            // 对于根级元素，parent 为 null
            for binding in &decl.child_bindings {
                // 使用 marker 索引定位插入位置
                self.push_str("insert(");
                self.push_str(&decl.name);
                self.push_str(", ");
                self.push_str(&decl.name);
                self.push_str(".firstChild, ");
                // 第二个参数是 anchor（插入位置的参考节点）
                // 对于动态内容，插入到 marker 位置
                self.push_str("null, ");
                self.push_str(&binding.expression);
                self.push_str(");\n");
            }
        }

        // 如果有属性绑定，生成属性设置
        for attr in &decl.attr_bindings {
            match attr.kind {
                AttrBindingKind::Attribute => {
                    self.push_str(&decl.name);
                    self.push_str(".setAttribute(\"");
                    self.push_str(&attr.name);
                    self.push_str("\", ");
                    self.push_str(&attr.expression);
                    self.push_str(");\n");
                }
                AttrBindingKind::Property => {
                    self.push_str(&decl.name);
                    self.push_str(".");
                    self.push_str(&attr.name);
                    self.push_str(" = ");
                    self.push_str(&attr.expression);
                    self.push_str(";\n");
                }
                AttrBindingKind::ClassName => {
                    self.push_str(&decl.name);
                    self.push_str(".className = ");
                    self.push_str(&attr.expression);
                    self.push_str(";\n");
                }
                AttrBindingKind::Style => {
                    self.push_str(&decl.name);
                    self.push_str(".style = ");
                    self.push_str(&attr.expression);
                    self.push_str(";\n");
                }
                AttrBindingKind::Event => {
                    // 事件在 delegateEvents 中处理
                }
                AttrBindingKind::Spread => {
                    self.push_str("Object.assign(");
                    self.push_str(&decl.name);
                    self.push_str(", ");
                    self.push_str(&attr.expression);
                    self.push_str(");\n");
                }
            }
        }
    }

    /// 生成 import 语句
    pub fn generate_imports(&mut self, helpers: &[String], module: &str) {
        if helpers.is_empty() {
            return;
        }

        self.push_str("import { ");
        self.push_str(&helpers.join(", "));
        self.push_str(" } from \"");
        self.push_str(module);
        self.push_str("\";\n\n");
    }

    /// 压入字符串
    pub fn push_str(&mut self, s: &str) {
        self.buffer.push_str(s);
    }

    /// 完成生成并返回代码和 sourcemap
    pub fn finish(self) -> (String, String) {
        (self.buffer, self.source_map.to_json("input.jsx"))
    }
}

impl Default for CodeGenerator {
    fn default() -> Self {
        Self::new("")
    }
}
