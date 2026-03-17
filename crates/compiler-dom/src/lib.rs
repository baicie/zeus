//! Zeus DOM 编译器模块
//!
//! 实现基于 oxc_traverse 的 DOM 编译器，将 JSX 转换为优化的 DOM 操作代码

mod template_analyzer;
mod template_ir;
mod control_flow;

pub use template_analyzer::TemplateAnalyzer;
pub use template_ir::DomTemplateIR;
pub use control_flow::ControlFlowAnalyzer;

use zeus_compiler_common::CompilerOptions;
use zeus_compiler_core::{compile as compile_with_traverse, Target};

/// DOM 编译器
pub struct DomCompiler {
    options: CompilerOptions,
}

impl DomCompiler {
    /// 创建新的 DOM 编译器
    pub fn new() -> Self {
        Self {
            options: CompilerOptions::default(),
        }
    }

    /// 使用指定选项创建编译器
    pub fn with_options(options: CompilerOptions) -> Self {
        Self { options }
    }

    /// 编译 JSX 源代码
    pub fn compile(&self, source: &str) -> Result<String, String> {
        compile_with_traverse(source, self.options.clone())
    }
}

impl Default for DomCompiler {
    fn default() -> Self {
        Self::new()
    }
}

/// 编译 JSX 源代码
pub fn compile(source: &str) -> Result<String, String> {
    let compiler = DomCompiler::new();
    compiler.compile(source)
}

/// 使用指定目标编译
pub fn compile_with_target(source: &str, target: Target) -> Result<String, String> {
    let _target = target;
    let options = CompilerOptions::default();
    // TODO: compiler-common 的 CompilerOptions::target 目前使用 zeus-compiler-common::Target
    // 这里暂时忽略，后续统一 Target 定义后再打通
    let compiler = DomCompiler::with_options(options);
    compiler.compile(source)
}
