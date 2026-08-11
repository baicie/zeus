mod codegen;

pub mod diagnostic;
pub mod ir;
pub mod lower;
pub mod span;

use serde::{Deserialize, Serialize};

use diagnostic::CompilerDiagnostic;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransformTarget {
    Dom,
    Ssr,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformModuleOptions {
    pub source: String,
    pub filename: String,
    pub target: TransformTarget,
    pub runtime_module: String,
    pub delegate_events: bool,
    pub source_map: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawSourceMap {
    pub version: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    pub sources: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_root: Option<String>,
    #[serde(rename = "sourcesContent")]
    pub sources_content: Vec<Option<String>>,
    pub names: Vec<String>,
    pub mappings: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformModuleResult {
    pub code: String,
    pub map: Option<RawSourceMap>,
    pub diagnostics: Vec<CompilerDiagnostic>,
}

pub fn transform_module(options: TransformModuleOptions) -> TransformModuleResult {
    if options.target != TransformTarget::Dom {
        return TransformModuleResult {
            code: String::new(),
            map: None,
            diagnostics: vec![CompilerDiagnostic::error(
                "ZEUS_UNSUPPORTED_TARGET",
                "The first Rust compiler slice only supports the DOM target.",
                &options.filename,
                None,
            )],
        };
    }

    let lowered = lower::lower_module(&options.source, &options.filename);
    if !lowered.diagnostics.is_empty() {
        return TransformModuleResult {
            code: String::new(),
            map: None,
            diagnostics: lowered.diagnostics,
        };
    }

    let Some(ir) = lowered.ir else {
        return TransformModuleResult {
            code: options.source,
            map: None,
            diagnostics: Vec::new(),
        };
    };

    if ir.components.is_empty() {
        return TransformModuleResult {
            code: options.source,
            map: None,
            diagnostics: Vec::new(),
        };
    }

    codegen::emit_module(
        &options.source,
        &options.filename,
        &options.runtime_module,
        options.delegate_events,
        options.source_map,
        &ir,
        &lowered.reserved_names,
    )
}
