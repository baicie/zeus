//! JSX 编译器模块
//!
//! 提供 JSX 到 DOM 操作的编译功能

pub mod compiler;

pub use compiler::{DomCompilerPass, DomCompilerState};

use zeus_compiler_common::CompilerOptions;
use zeus_compiler_core::traverse::compile as core_compile;

/// 编译 JSX 源代码
pub fn compile(source: &str) -> Result<String, String> {
    core_compile(source, CompilerOptions::default())
}

/// 编译 JSX 源代码（带选项）
pub fn compile_with_options(source: &str, options: CompilerOptions) -> Result<String, String> {
    core_compile(source, options)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compile_simple() {
        let source = r#"<div>Hello</div>"#;
        let result = compile(source);
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(!output.is_empty());
    }

    #[test]
    fn test_compile_with_event() {
        let source = r#"<button onClick={handler}>Click</button>"#;
        let result = compile(source);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_dynamic_content() {
        let source = r#"<div>{message()}</div>"#;
        let result = compile(source);
        assert!(result.is_ok());
    }
}
