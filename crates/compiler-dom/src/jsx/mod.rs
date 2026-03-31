//! JSX DOM 编译器模块
//!
//! 提供完整的 JSX 到 DOM 操作的编译功能
//!
//! 包含:
//! - DOM 元素转换
//! - 属性处理
//! - 事件委托
//! - 子节点处理
//! - 模板生成
//! - 代码生成
//! - 水合支持

pub mod compiler;
pub mod element;
pub mod attributes;
pub mod events;
pub mod children;
pub mod template;
pub mod codegen;
pub mod hydration;

// Re-exports
pub use compiler::{DomCompilerPass, DomCompilerState};
pub use element::DomElementTransformer;
pub use attributes::{AttributeHandler, generate_attr_code, is_dynamic_value, expr_to_code};
pub use events::{EventHandler, can_delegate_event, is_event_attribute, extract_event_name, is_forced_direct};
pub use children::{ChildrenHandler, ChildrenResult, DynamicChildResult};
pub use template::TemplateGenerator;
pub use codegen::DomCodegen;
pub use hydration::HydrationGenerator;

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
