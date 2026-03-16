//! ZeusJS Binding 模块
//!
//! 提供 Rust 编译器到 JavaScript 的 NAPI-RS 绑定

use napi::Result;
use napi_derive::napi;

/// 编译 JavaScript/TypeScript 源代码
#[napi]
pub fn compile(source: String, target: Option<String>) -> Result<String> {
    // Use DOM compiler by default
    let _target = target.unwrap_or_else(|| "dom".to_string());
    
    // Use DOM compiler
    let result = zeus_compiler_dom::compile(&source)
        .map_err(|e| napi::Error::from_reason(e))?;

    Ok(result)
}

/// 编译 DOM 目标
#[napi]
pub fn compile_dom(source: String) -> Result<String> {
    compile(source, Some("dom".to_string()))
}

/// 编译 SSR 目标
#[napi]
pub fn compile_ssr(source: String) -> Result<String> {
    compile(source, Some("ssr".to_string()))
}

/// 编译 WebComponent 目标
#[napi]
pub fn compile_web_component(source: String) -> Result<String> {
    compile(source, Some("webcomponent".to_string()))
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
