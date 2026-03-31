//! Zeus 核心编译器模块
//!
//! 提供基于 oxc 的核心编译功能

mod parser;
pub mod codegen;
pub mod traverse;
pub mod jsx;

pub use parser::{parse_with_allocator, parse_tsx_with_allocator};

pub use codegen::CodeGenerator;
pub use traverse::{
    DomCompilerState, DomCompilerPass, compile, Target,
};

// JSX 编译器导出
pub use jsx::{
    // Config
    GenerateMode, JsxConfig,
    // State
    JsxCompilerState, JsxError, JsxErrorCode,
    // IR
    AttrBinding, AttrBindingKind, ChildBinding,
    DynamicAttr, ElementResult, MarkerKind, Renderer, TemplateDecl,
    // Utils
    CheckConfig, HandlerType, classify_attribute, escape_html,
    get_jsx_tag_name, is_component, is_custom_element,
    is_dynamic_expression, is_reserved_namespace, is_svg_element,
    is_useless_child, is_void_element, normalize_whitespace,
    parse_namespace, needs_import_node, to_event_name,
    // Preprocess
    JsxPreprocessor,
};
