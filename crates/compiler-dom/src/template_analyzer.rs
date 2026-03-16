//! 模板分析器模块

use zeus_compiler_common::TemplateIR;

/// 模板分析器
#[allow(dead_code)]
pub struct TemplateAnalyzer {
    source: String,
}

impl TemplateAnalyzer {
    /// 创建新的模板分析器
    pub fn new(source: &str) -> Self {
        Self {
            source: source.to_string(),
        }
    }

    /// 分析并生成模板 IR
    pub fn analyze(&mut self) -> TemplateIR {
        TemplateIR::new()
    }
}
