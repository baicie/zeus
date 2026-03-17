//! Template IR module
//!
//! Provides DOM-specific template IR types.

use zeus_compiler_common::TemplateIR as CommonTemplateIR;

/// DOM template IR
#[derive(Clone, Debug)]
pub struct DomTemplateIR {
    /// Base template IR
    pub base: CommonTemplateIR,
    /// Tag name
    pub tag_name: String,
    /// Is self-closing
    pub is_self_closing: bool,
    /// Is SVG element
    pub is_svg: bool,
    /// Is component
    pub is_component: bool,
}

impl DomTemplateIR {
    /// Create a new DOM template IR
    pub fn new(tag_name: &str) -> Self {
        Self {
            base: CommonTemplateIR::new(),
            tag_name: tag_name.to_string(),
            is_self_closing: false,
            is_svg: false,
            is_component: false,
        }
    }
}
