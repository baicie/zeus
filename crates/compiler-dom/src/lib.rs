//! Zeus Compiler DOM
//!
//! SolidJS-style JSX compilation: transforms JSX into template() + insert() + effect()
//! code with fine-grained reactivity and no Virtual DOM.
//!
//! Uses string-based code generation instead of AST manipulation for simplicity.

pub mod dom_transforms;
pub mod event_handlers;
pub mod jsx;
pub mod optimizations;
pub mod template_analyzer;
pub mod template_ir;

use oxc::allocator::Allocator;
use oxc::diagnostics::OxcDiagnostic;
use oxc::parser::Parser;
use oxc::span::SourceType;
use zeus_compiler_core::{parser, CompilerOptions};

/// DOM-specific compiler options
#[derive(Debug, Clone)]
pub struct DomCompilerOptions {
    pub base: CompilerOptions,
    pub jsx: bool,
    pub jsx_pragma: Option<String>,
    pub jsx_pragma_frag: Option<String>,
    pub dom_optimizations: bool,
    /// Module path for runtime imports (default: "@zeus-js/runtime-dom")
    pub runtime_module: Option<String>,
}

/// 编译错误结构
#[derive(Debug, Clone)]
pub struct CompileError {
    pub message: String,
    pub start_offset: u32,
    pub end_offset: u32,
}

impl CompileError {
    pub fn from_diagnostic(diag: OxcDiagnostic) -> Self {
        // 从诊断消息中尝试提取位置信息
        let msg = diag.to_string();
        
        // 尝试从调试输出中获取 span
        let debug_str = format!("{:?}", diag);
        let (start_offset, end_offset) = extract_span_from_debug(&debug_str).unwrap_or((0, 0));
        
        Self {
            message: msg,
            start_offset,
            end_offset,
        }
    }
}

/// 从调试输出中提取 span 信息
fn extract_span_from_debug(debug_str: &str) -> Option<(u32, u32)> {
    // 尝试匹配 "span: Span { start: X, end: Y }" 格式
    if let Some(span_start) = debug_str.find("span:") {
        let after_span = &debug_str[span_start..];
        
        // 查找 start:
        if let Some(start_key) = after_span.find("start:") {
            let after_start = &after_span[start_key + 6..];
            // 提取数字
            if let Some(num_start) = after_start.find(|c: char| c.is_ascii_digit()) {
                let num_str = &after_start[num_start..];
                let num_end = num_str.find(|c: char| !c.is_ascii_digit()).unwrap_or(num_str.len());
                if let Ok(start) = num_str[..num_end].parse::<u32>() {
                    // 找 end
                    if let Some(end_key) = num_str.find("end:") {
                        let after_end = &num_str[end_key + 3..];
                        if let Some(col_start) = after_end.find(|c: char| c.is_ascii_digit()) {
                            let col_str = &after_end[col_start..];
                            let col_end = col_str.find(|c: char| !c.is_ascii_digit()).unwrap_or(col_str.len());
                            if let Ok(end) = col_str[..col_end].parse::<u32>() {
                                return Some((start, end));
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// DOM compiler — compiles JSX/TSX to SolidJS-style DOM code
pub struct DomCompiler;

impl DomCompiler {
    pub fn new() -> Self {
        Self
    }

    /// Main compilation entry point
    ///
    /// Pipeline:
    /// 1. Parse source → AST (read-only)
    /// 2. Walk AST to find JSX elements
    /// 3. Analyze each JSX tree → TemplateIR
    /// 4. Generate replacement JS code as strings
    /// 5. Apply span-based replacements to produce final output
    pub fn compile_dom(
        &self,
        source: &str,
        options: &DomCompilerOptions,
    ) -> Result<String, OxcDiagnostic> {
        if !options.jsx {
            return Ok(source.to_string());
        }

        let allocator = Allocator::default();

        // 根据 options 创建正确的 source_type，支持 JSX 和 TypeScript
        let mut source_type = options.base.source_type;
        // 确保启用 JSX 模式
        source_type = source_type.with_jsx(true);

        // 1. Parse (read-only — we don't modify the AST)
        let program = match parser::parse_source(&allocator, source, source_type) {
            Ok(p) => p,
            Err(errs) => return Err(errs.into_iter().next().unwrap()),
        };

        // 2-4. Walk AST, analyze JSX, generate code
        let mut compiler = jsx::JsxCompiler::new(source);
        compiler.visit_program(&program);

        // 5. Apply replacements and generate final output
        Ok(compiler.generate_output())
    }

    /// Legacy helper
    pub fn transform_jsx_to_dom(
        &self,
        jsx_code: &str,
    ) -> Result<String, oxc::diagnostics::Error> {
        let options = DomCompilerOptions {
            base: CompilerOptions {
                source_type: SourceType::jsx(),
                experimental: false,
            },
            jsx: true,
            jsx_pragma: None,
            jsx_pragma_frag: None,
            dom_optimizations: true,
            runtime_module: None,
        };

        match self.compile_dom(jsx_code, &options) {
            Ok(code) => Ok(code),
            Err(err) => Err(err.into()),
        }
    }

    /// Get parse errors with location info
    pub fn get_parse_errors(
        source: &str,
        source_type: SourceType,
    ) -> Vec<CompileError> {
        let allocator = Allocator::default();
        let parser = Parser::new(&allocator, source, source_type);
        let result = parser.parse();
        
        result.errors.into_iter().map(CompileError::from_diagnostic).collect()
    }
}

impl Default for DomCompiler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile(source: &str) -> String {
        let compiler = DomCompiler::new();
        let options = DomCompilerOptions {
            base: CompilerOptions {
                source_type: SourceType::default().with_module(true).with_jsx(true),
                experimental: false,
            },
            jsx: true,
            jsx_pragma: None,
            jsx_pragma_frag: None,
            dom_optimizations: false,
            runtime_module: None,
        };
        compiler
            .compile_dom(source, &options)
            .expect("compilation failed")
    }

    #[test]
    fn test_compile_static_jsx() {
        let code = compile(r#"const App = () => <div>Hello</div>"#);
        println!("Output:\n{}", code);
        assert!(code.contains("template"), "Should contain template()");
        assert!(
            code.contains("<div>Hello</div>"),
            "Template should contain static HTML"
        );
        assert!(
            !code.contains("document.createElement"),
            "Should NOT contain createElement"
        );
    }

    #[test]
    fn test_compile_static_attrs() {
        let code = compile(r#"const App = () => <div class="hello">World</div>"#);
        println!("Output:\n{}", code);
        // The HTML is escaped in the template string
        assert!(code.contains(r#"class=\"hello\""#) || code.contains(r#"class="hello""#));
    }

    #[test]
    fn test_compile_nested_elements() {
        let code = compile(
            r#"const App = () => <div><span>Hello</span><p>World</p></div>"#,
        );
        println!("Output:\n{}", code);
        assert!(code.contains("<div><span>Hello</span><p>World</p></div>"));
    }

    #[test]
    fn test_compile_dynamic_expression() {
        let code = compile(
            r#"function App() { const count = signal(0); return <div>{count()}</div> }"#,
        );
        println!("Output:\n{}", code);
        assert!(code.contains("template"), "Should have template");
        assert!(code.contains("insert"), "Should have insert()");
    }

    #[test]
    fn test_compile_event_handler() {
        let code = compile(
            r#"const App = () => <button onClick={() => alert("hi")}>Click</button>"#,
        );
        println!("Output:\n{}", code);
        assert!(code.contains("$$click"), "Should have delegated event");
        assert!(
            code.contains("delegateEvents"),
            "Should have delegateEvents()"
        );
    }

    #[test]
    fn test_compile_component() {
        let code = compile(r#"const App = () => <Counter count={0} />"#);
        println!("Output:\n{}", code);
        assert!(
            code.contains("Counter({ count: 0 })"),
            "Should directly call component function"
        );
        assert!(code.contains("Counter"), "Should reference Counter");
    }

    #[test]
    fn test_conditional_rendering() {
        let code = compile(r#"const App = () => <div>{show() ? <span>Yes</span> : <span>No</span>}</div>"#);
        println!("Conditional output:\n{}", code);
        assert!(code.contains("insert"), "Should have insert() call");
        assert!(code.contains("show()"), "Should contain condition");
        assert!(code.contains("?"), "Should contain ternary operator");
    }

    #[test]
    fn test_list_rendering() {
        let code = compile(r#"const App = () => <ul>{items().map(item => <li>{item}</li>)}</ul>"#);
        println!("List output:\n{}", code);
        assert!(code.contains("insert"), "Should have insert() call");
        assert!(code.contains("map"), "Should contain map call");
    }

    #[test]
    fn test_logical_and_rendering() {
        let code = compile(r#"const App = () => <div>{show() && <span>Visible</span>}</div>"#);
        println!("Logical AND output:\n{}", code);
        assert!(code.contains("insert"), "Should have insert() call");
        assert!(code.contains("&&"), "Should contain logical AND");
    }

    #[test]
    fn test_fragment_with_event() {
        let code = compile(r#"function App() { return (<><button onClick={() => alert("hi")}>Click</button></>) }"#);
        println!("Fragment with event output:\n{}", code);
        assert!(code.contains("$$click"), "Should have delegated event handler");
        assert!(code.contains("delegateEvents"), "Should have delegateEvents()");
    }
}
