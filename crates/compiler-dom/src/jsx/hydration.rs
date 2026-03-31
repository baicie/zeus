//! JSX DOM 水合支持模块
//!
//! 提供水合相关的模板和处理逻辑

#[allow(dead_code)]
pub struct HydrationGenerator;

impl HydrationGenerator {
    /// 生成水合数据属性
    pub fn generate_hydration_key(&self, index: usize) -> String {
        format!("data-hk=\"{}\"", index)
    }
}
