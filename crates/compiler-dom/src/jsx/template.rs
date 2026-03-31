//! JSX DOM 模板生成模块
//!
//! 提供模板生成相关的逻辑

#[allow(dead_code)]
pub struct TemplateGenerator;

impl TemplateGenerator {
    /// 生成模板 key
    #[allow(dead_code)]
    pub fn generate_template_key(&self, index: usize) -> String {
        format!("_tmpl${}", index)
    }
}
