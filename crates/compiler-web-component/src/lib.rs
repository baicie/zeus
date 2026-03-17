//! Zeus WebComponent 编译器模块
//!
//! 实现 WebComponent 编译

mod options;
mod macros;

pub use options::WebComponentOptions;
pub use macros::MacroProcessor;

use zeus_compiler_common::CompilerOptions;

/// WebComponent 编译器状态
pub struct WebComponentCompilerState {
    /// 检测到的自定义元素
    pub custom_elements: Vec<CustomElementInfo>,
    /// 检测到的事件
    pub events: Vec<String>,
    /// 检测到的属性
    pub props: Vec<String>,
}

/// 自定义元素信息
#[derive(Debug, Clone)]
pub struct CustomElementInfo {
    /// 标签名
    pub tag_name: String,
    /// 类名
    pub class_name: String,
    /// 属性
    pub props: Vec<String>,
    /// 事件
    pub events: Vec<String>,
}

impl Default for WebComponentCompilerState {
    fn default() -> Self {
        Self {
            custom_elements: Vec::new(),
            events: Vec::new(),
            props: Vec::new(),
        }
    }
}

/// WebComponent 编译器
#[allow(dead_code)]
pub struct WebComponentCompiler {
    options: WebComponentOptions,
    compiler_options: CompilerOptions,
}

impl WebComponentCompiler {
    pub fn new() -> Self {
        Self {
            options: WebComponentOptions::default(),
            compiler_options: CompilerOptions::default(),
        }
    }

    pub fn with_options(options: WebComponentOptions) -> Self {
        Self {
            options,
            compiler_options: CompilerOptions::default(),
        }
    }

    /// 编译为 WebComponent 代码
    pub fn compile(&self, source: &str) -> Result<String, String> {
        let mut code = String::new();

        // 检测自定义元素
        let elements = self.detect_custom_elements(source);

        // 导入 WebComponent runtime
        code.push_str("// WebComponent compiled\n");
        code.push_str("import { defineCustomElement, html } from '@zeus-js/web-components';\n");

        // 添加响应式导入
        if !elements.is_empty() {
            code.push_str("import { signal, effect } from '@zeus-js/signal';\n");
        }

        code.push('\n');

        // 处理 Shadow DOM 模式
        match self.options.mode {
            options::WebComponentMode::Shadow => {
                code.push_str("// Shadow DOM mode\n");
                if self.options.shadow_dom {
                    code.push_str("const shadowOptions = { mode: 'open' };\n");
                }
            }
            options::WebComponentMode::CustomElement => {
                code.push_str("// Custom Element mode\n");
            }
            _ => {
                code.push_str("// Standard mode\n");
            }
        }

        code.push('\n');
        code.push_str(source);
        code.push('\n');

        // 为每个自定义元素生成 defineCustomElement 调用
        for element in &elements {
            code.push_str(&format!(
                "\ndefineCustomElement('{}', class extends HTMLElement {{\n",
                element.tag_name
            ));

            // 生成属性 getter/setter
            for prop in &element.props {
                code.push_str(&format!(
                    "  get {}() {{ return this._{}.value; }}\n",
                    prop, prop
                ));
                code.push_str(&format!(
                    "  set {}(val) {{ this._{}.value = val; }}\n",
                    prop, prop
                ));
            }

            // 生成 connectedCallback
            code.push_str("  connectedCallback() {\n");
            if self.options.shadow_dom {
                code.push_str("    this.attachShadow(shadowOptions);\n");
            }
            code.push_str("  }\n");

            code.push_str("}});\n");
        }

        Ok(code)
    }

    /// 检测源代码中的自定义元素
    fn detect_custom_elements(&self, source: &str) -> Vec<CustomElementInfo> {
        let mut elements = Vec::new();

        // 简单的模式匹配：检测 <xxx-xxx> 标签
        // 实际应该使用 AST 遍历
        let chars: Vec<char> = source.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            if chars[i] == '<' {
                // 寻找标签名
                let mut tag_name = String::new();
                let mut j = i + 1;

                // 跳过空白
                while j < chars.len() && chars[j].is_whitespace() {
                    j += 1;
                }

                // 收集标签名（字母和连字符）
                while j < chars.len() {
                    let c = chars[j];
                    if c.is_alphanumeric() || c == '-' {
                        tag_name.push(c);
                        j += 1;
                    } else {
                        break;
                    }
                }

                // 检查是否是有效的自定义元素名（包含连字符）
                if tag_name.contains('-') && tag_name.len() > 1 {
                    // 检查是否已存在
                    if !elements.iter().any(|e: &CustomElementInfo| e.tag_name == tag_name) {
                        elements.push(CustomElementInfo {
                            tag_name: tag_name.clone(),
                            class_name: Self::tag_to_class(&tag_name),
                            props: Vec::new(),
                            events: Vec::new(),
                        });
                    }
                }

                i = j;
            } else {
                i += 1;
            }
        }

        elements
    }

    /// 将标签名转换为类名
    fn tag_to_class(tag: &str) -> String {
        let mut class = String::new();
        let mut capitalize_next = true;

        for c in tag.chars() {
            if c == '-' {
                capitalize_next = true;
            } else if capitalize_next {
                class.push(c.to_ascii_uppercase());
                capitalize_next = false;
            } else {
                class.push(c);
            }
        }

        class
    }
}

impl Default for WebComponentCompiler {
    fn default() -> Self {
        Self::new()
    }
}

/// 编译 JSX 源代码为 WebComponent
pub fn compile(source: &str) -> Result<String, String> {
    let compiler = WebComponentCompiler::new();
    compiler.compile(source)
}

/// 使用选项编译
pub fn compile_with_options(source: &str, options: WebComponentOptions) -> Result<String, String> {
    let compiler = WebComponentCompiler::with_options(options);
    compiler.compile(source)
}
