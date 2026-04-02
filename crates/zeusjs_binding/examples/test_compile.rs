// Test program for compiler
fn main() {
    let source = r#"
function RouterProvider(props) {
  return <RouterContext.Provider value={props.router}>
    {props.children}
  </RouterContext.Provider>;
}
"#;

    println!("Compiling: {}", source);

    let options = zeus_compiler_common::CompilerOptions {
        target: zeus_compiler_common::Target::Dom,
        jsx: true,
        source_type: Some("tsx".to_string()),
        jsx_pragma: Some("h".to_string()),
        jsx_pragma_frag: Some("Fragment".to_string()),
        runtime_module: Some("@zeus-js/core".to_string()),
        hydratable: false,
        delegate_events: true,
        dom_optimizations: true,
    };

    match zeus_compiler_dom::compile_with_options(source, options) {
        Ok(code) => println!("Compiled:\n{}", code),
        Err(e) => println!("Error: {}", e),
    }
}
