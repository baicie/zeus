//! Zeus 核心编译器模块
//!
//! 提供基于 oxc 的核心编译功能

mod parser;
pub mod codegen;
pub mod traverse;

pub use parser::{parse_with_allocator, parse_tsx_with_allocator};

pub use codegen::CodeGenerator;
pub use traverse::{
    DomCompilerState, DomCompilerPass, compile, Target,
    ChildBinding, TemplateDecl, AttrBinding, AttrBindingKind,
};
