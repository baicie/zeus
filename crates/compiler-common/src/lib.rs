//! Zeus 编译器公共模块
//!
//! 提供所有编译器共享的通用类型、配置和工具函数

mod config;
mod error;
mod types;
mod utils;

pub use config::{CompilerOptions, Target};
pub use error::{CompileError, CompileErrorType, CompileResult, CompileOutput};
pub use types::{Binding, BindingKind, DomPath, TemplateIR, TraversalStep};
pub use utils::html_escape;
