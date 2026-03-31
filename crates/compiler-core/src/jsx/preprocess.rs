//! JSX 编译器预处理模块
//!
//! 在 AST 遍历前执行配置合并和模式检测

use crate::jsx::config::{GenerateMode, JsxConfig};
use crate::jsx::state::JsxCompilerState;

/// JSX 预处理器
pub struct JsxPreprocessor;

impl JsxPreprocessor {
    /// 执行预处理：合并配置、检测处理范围
    #[allow(dead_code)]
    pub fn run(source: &str, user_config: Option<JsxConfig>) -> JsxCompilerState<'_> {
        // 1. 构建配置
        let mut config = user_config.unwrap_or_default();

        // 2. 检测 @jsxImportSource 注释
        if let Some(ref lib) = config.require_import_source {
            let has_marker = Self::check_jsx_import_source(source);
            if !has_marker && lib != "zeus/runtime-dom" {
                return JsxCompilerState::new(config);
            }
        }

        // 3. 检测生成模式
        let mode = Self::detect_generate_mode(source);
        if mode != GenerateMode::Dom {
            config.generate = mode;
        }

        // 4. 构建初始状态
        let mut state = JsxCompilerState::new(config);
        state.source_file = Some(source.to_string());

        state
    }

    /// 检测 @jsxImportSource 注释
    fn check_jsx_import_source(source: &str) -> bool {
        for line in source.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("//") || trimmed.starts_with("/*") {
                if trimmed.contains("@jsxImportSource")
                    || trimmed.contains("@jsx-runtime")
                    || trimmed.contains("jsx:")
                {
                    return true;
                }
            }
        }
        false
    }

    /// 检测生成模式
    fn detect_generate_mode(source: &str) -> GenerateMode {
        for line in source.lines() {
            let trimmed = line.trim();
            if trimmed.contains("server-side") || trimmed.contains("ssr:") {
                return GenerateMode::Ssr;
            }
        }
        GenerateMode::Dom
    }
}
