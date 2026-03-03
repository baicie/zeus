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
        let source_type = SourceType::jsx();

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
            code.contains("createComponent"),
            "Should have createComponent()"
        );
        assert!(code.contains("Counter"), "Should reference Counter");
    }
}
