use zeus_compiler_dom::{DomCompiler, DomCompilerOptions};
use zeus_compiler_core::CompilerOptions;
use oxc::span::SourceType;

#[cfg(test)]
mod tests {
    use super::*;

    fn create_options(jsx: bool) -> DomCompilerOptions {
        DomCompilerOptions {
            base: CompilerOptions {
                source_type: SourceType::default().with_module(true).with_jsx(jsx),
                experimental: false,
            },
            jsx,
            jsx_pragma: None,
            jsx_pragma_frag: None,
            dom_optimizations: true,
            runtime_module: None,
        }
    }

    #[test]
    fn test_compile_conditional_if_return() {
        let source = r#"
function Child({ shouldError }) {
  if (shouldError()) {
    return <h1>Error</h1>
  }
  return <h1>Child</h1>
}
"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
        let code = result.unwrap();
        println!("Compiled code:\n{}", code);
        
        // Check that JSX is compiled to template calls
        assert!(code.contains("_tmpl$"), "Should contain template variables");
        assert!(code.contains("template("), "Should contain template() calls");
    }

    #[test]
    fn test_compile_conditional_if_return_with_else() {
        let source = r#"
function Child({ status }) {
  if (status() === 'error') {
    return <div class="error">Error</div>
  } else {
    return <div class="success">Success</div>
  }
}
"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
        let code = result.unwrap();
        println!("Compiled code with else:\n{}", code);
        
        // Check that JSX is compiled to template calls
        assert!(code.contains("_tmpl$"), "Should contain template variables");
        assert!(code.contains("template("), "Should contain template() calls");
    }
}
