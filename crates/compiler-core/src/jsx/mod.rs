//! JSX 编译器核心模块
//!
//! 提供完整的 JSX 到 JavaScript 编译功能
//!
//! 基于 `dom-expressions` 方案设计，实现：
//! - 零虚拟 DOM 开销的 DOM 操作代码生成
//! - 编译时确定性动态性判断
//! - 模板复用优化
//! - 事件委托系统
//! - 与 Zeus 信号系统的响应式集成

pub mod config;
pub mod constants;
pub mod ir;
pub mod state;
pub mod utils;
pub mod preprocess;
pub mod transform;
pub mod component;
pub mod condition;
pub mod fragment;

// Re-exports
pub use config::{GenerateMode, JsxConfig};
pub use state::{JsxCompilerState, JsxError, JsxErrorCode};
pub use ir::{
    AttrBinding, AttrBindingKind, ChildBinding,
    ComponentResult, DynamicAttr, ElementResult, MarkerKind,
    Renderer, TemplateDecl,
};
pub use utils::{
    CheckConfig, HandlerType, classify_attribute, escape_html,
    get_jsx_tag_name, is_component, is_custom_element,
    is_dynamic_expression, is_reserved_namespace, is_svg_element,
    is_useless_child, is_void_element, normalize_whitespace,
    parse_namespace, needs_import_node, to_event_name,
};
pub use preprocess::JsxPreprocessor;
