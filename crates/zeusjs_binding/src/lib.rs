//! ZeusJS Binding 模块
//!
//! 提供 Rust 编译器到 JavaScript 的 NAPI-RS 绑定

use napi::Result;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

/// 编译器选项
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[napi(object)]
pub struct CompilerOptions {
    /// 源代码类型
    #[serde(rename = "sourceType", default, skip_serializing_if = "Option::is_none")]
    pub source_type: Option<String>,
    /// 是否启用实验性功能
    #[serde(default)]
    pub experimental: bool,
    /// 目标 ES 版本
    #[serde(default = "default_target")]
    pub target: String,
    /// 是否压缩代码
    #[serde(default)]
    pub minify: bool,
}

fn default_target() -> String {
    "es5".to_string()
}

/// 编译结果
#[derive(Debug, Serialize)]
#[napi(object)]
pub struct CompileResult {
    /// 是否成功
    pub success: bool,
    /// 生成的代码
    pub code: String,
    /// 错误信息（如果有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 编译 JavaScript/TypeScript 源代码
#[napi]
pub fn compile(source: String, options: Option<CompilerOptions>) -> Result<CompileResult> {
    let opts = options.unwrap_or_default();

    // 转换为编译器选项
    let compiler_options = zeus_compiler_common::CompilerOptions {
        target: zeus_compiler_common::Target::Dom,
        jsx: true,
        source_type: opts.source_type,
        jsx_pragma: Some("h".to_string()),
        jsx_pragma_frag: Some("Fragment".to_string()),
        runtime_module: Some("@zeus-js/core".to_string()),
        hydratable: false,
        delegate_events: true,
        dom_optimizations: true,
    };

    // Use DOM compiler
    let result = zeus_compiler_dom::compile_with_options(&source, compiler_options)
        .map_err(|e| napi::Error::from_reason(e));

    match result {
        Ok(code) => Ok(CompileResult {
            success: true,
            code,
            error: None,
        }),
        Err(e) => Ok(CompileResult {
            success: false,
            code: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

/// 编译 DOM 目标
#[napi]
pub fn compile_dom(source: String) -> Result<CompileResult> {
    compile(source, None)
}

/// 编译 SSR 目标
#[napi]
pub fn compile_ssr(source: String) -> Result<CompileResult> {
    // Use SSR compiler
    let result = zeus_compiler_ssr::compile(&source)
        .map_err(|e| napi::Error::from_reason(e));

    match result {
        Ok(code) => Ok(CompileResult {
            success: true,
            code,
            error: None,
        }),
        Err(e) => Ok(CompileResult {
            success: false,
            code: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

/// 编译 WebComponent 目标
#[napi]
pub fn compile_web_component(source: String) -> Result<CompileResult> {
    // Use WebComponent compiler
    let result = zeus_compiler_web_component::compile(&source)
        .map_err(|e| napi::Error::from_reason(e));

    match result {
        Ok(code) => Ok(CompileResult {
            success: true,
            code,
            error: None,
        }),
        Err(e) => Ok(CompileResult {
            success: false,
            code: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

/// 编译 WebComponent 宏
#[napi]
pub fn compile_web_component_macros(source: String) -> Result<String> {
    // 返回 JSON 格式的宏结果
    Ok(format!(
        r#"{{"code":"{}","macrosFound":false,"macros":null}}"#,
        source.replace('"', "\\\"")
    ))
}

/// 转换 WebComponent 宏
#[napi]
pub fn transform_web_component_macros(source: String) -> Result<String> {
    // 直接返回源代码，因为宏处理还在开发中
    // TODO: 实现真正的宏转换
    Ok(source)
}

/// 解析源代码
#[napi]
pub fn parse(source: String) -> Result<String> {
    Ok(format!("Parsed {} bytes of JSX code", source.len()))
}

/// 获取编译器版本
#[napi]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 检查编译器是否支持指定的目标
#[napi]
pub fn supports_target(target: String) -> bool {
    matches!(target.as_str(), "dom" | "ssr" | "webcomponent")
}

/// 主编译器函数
#[napi]
pub fn compiler(source: String, options: Option<CompilerOptions>) -> Result<CompileResult> {
    compile(source, options)
}
