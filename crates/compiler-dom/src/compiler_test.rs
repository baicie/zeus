use zeus_compiler_dom::{DomCompiler, DomCompilerOptions};
use zeus_compiler_core::CompilerOptions;
use oxc::span::SourceType;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compile_simple_jsx() {
        let source = r#"const App = () => <div>Hello</div>"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
        let code = result.unwrap();
        assert!(code.contains("template"));
    }

    #[test]
    fn test_compile_jsx_with_children() {
        let source = r#"const App = () => <div><span>Hello</span><span>World</span></div>"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_jsx_with_expression() {
        let source = r#"const App = () => <div>{'Hello'}</div>"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_jsx_with_conditional() {
        let source = r#"const App = (props) => <div>{props.flag ? <span>Yes</span> : <span>No</span>}</div>"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_jsx_with_list() {
        let source = r#"const App = () => <ul>{[1,2,3].map(n => <li key={n}>{n}</li>)}</ul>"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_non_jsx() {
        let source = r#"const add = (a, b) => a + b"#;
        let compiler = DomCompiler::new();
        let options = create_options(false);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), source);
    }

    #[test]
    fn test_jsx_disabled() {
        let source = r#"const App = () => <div>Hello</div>"#;
        let compiler = DomCompiler::new();
        let options = create_options(false);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
        // When JSX is disabled, source should be returned as-is
        assert!(result.unwrap().contains("<div>"));
    }

    #[test]
    fn test_compile_jsx_with_event() {
        let source = r#"const App = () => <button onClick={() => console.log('click')}>Click me</button>"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_jsx_with_props() {
        let source = r#"const App = () => <div className="container" id="app">Content</div>"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_jsx_with_nested_components() {
        let source = r#"
const Header = () => <header>Header</header>
const Footer = () => <footer>Footer</footer>
const App = () => <div><Header /><main>Content</main><Footer /></div>
"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
    }

    #[test]
    fn test_warning_missing_key() {
        // Test that warnings are collected for missing key
        let source = r#"const App = () => <ul>{[1,2,3].map(n => <li>{n}</li>)}</ul>"#;
        let compiler = DomCompiler::new();
        let options = create_options(true);
        
        let result = compiler.compile_dom(source, &options);
        assert!(result.is_ok());
        // The compiler should have warnings about missing key
        // Note: Currently warnings are collected but not exposed in the return type
    }
}

fn create_options(jsx: bool) -> DomCompilerOptions {
    DomCompilerOptions {
        base: CompilerOptions {
            source_type: SourceType::tsx(),
            experimental: true,
        },
        jsx,
        jsx_pragma: None,
        jsx_pragma_frag: None,
        dom_optimizations: true,
        runtime_module: None,
    }
}
