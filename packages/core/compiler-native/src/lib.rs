//! Thin Node-API adapter for the Zeus Rust compiler.

use napi::{Error, Result, Status};
use napi_derive::napi;
use zeus_compiler::{
    RawSourceMap as CoreRawSourceMap, TransformModuleOptions as CoreTransformModuleOptions,
    TransformModuleResult as CoreTransformModuleResult, TransformTarget,
    diagnostic::{CompilerDiagnostic as CoreCompilerDiagnostic, DiagnosticSeverity},
    span::{SourcePosition as CoreSourcePosition, SourceSpan as CoreSourceSpan},
};

#[napi(object)]
pub struct TransformModuleOptions {
    pub source: String,
    pub filename: String,
    #[napi(ts_type = "'dom' | 'ssr'")]
    pub target: String,
    pub runtime_module: String,
    pub delegate_events: bool,
    pub source_map: bool,
    pub hmr: Option<bool>,
}

#[napi(object, use_nullable = true)]
pub struct TransformModuleResult {
    pub code: String,
    pub map: Option<RawSourceMap>,
    pub diagnostics: Vec<CompilerDiagnostic>,
}

#[napi(object)]
pub struct RawSourceMap {
    pub version: u8,
    pub file: Option<String>,
    pub sources: Vec<String>,
    pub source_root: Option<String>,
    #[napi(ts_type = "Array<string | null>")]
    pub sources_content: Vec<Option<String>>,
    pub names: Vec<String>,
    pub mappings: String,
}

#[napi(object)]
pub struct CompilerDiagnostic {
    pub code: String,
    pub message: String,
    #[napi(ts_type = "'error' | 'warning'")]
    pub severity: String,
    pub filename: String,
    pub hint: Option<String>,
    pub span: Option<SourceSpan>,
}

#[napi(object)]
pub struct SourceSpan {
    pub start: SourcePosition,
    pub end: SourcePosition,
}

#[napi(object)]
pub struct SourcePosition {
    pub offset: u32,
    pub line: u32,
    pub column: u32,
}

#[napi(js_name = "transformModule", catch_unwind)]
pub fn transform_module(options: TransformModuleOptions) -> Result<TransformModuleResult> {
    let target = match options.target.as_str() {
        "dom" => TransformTarget::Dom,
        "ssr" => TransformTarget::Ssr,
        _ => {
            return Err(Error::new(
                Status::InvalidArg,
                "target must be \"dom\" or \"ssr\"",
            ));
        }
    };

    if options.filename.is_empty() {
        return Err(Error::new(Status::InvalidArg, "filename must not be empty"));
    }
    if options.runtime_module.is_empty() {
        return Err(Error::new(
            Status::InvalidArg,
            "runtimeModule must not be empty",
        ));
    }

    Ok(zeus_compiler::transform_module(CoreTransformModuleOptions {
        source: options.source,
        filename: options.filename,
        target,
        runtime_module: options.runtime_module,
        delegate_events: options.delegate_events,
        source_map: options.source_map,
        hmr: options.hmr.unwrap_or(false),
    })
    .into())
}

impl From<CoreTransformModuleResult> for TransformModuleResult {
    fn from(result: CoreTransformModuleResult) -> Self {
        Self {
            code: result.code,
            map: result.map.map(Into::into),
            diagnostics: result.diagnostics.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<CoreRawSourceMap> for RawSourceMap {
    fn from(map: CoreRawSourceMap) -> Self {
        Self {
            version: map.version,
            file: map.file,
            sources: map.sources,
            source_root: map.source_root,
            sources_content: map.sources_content,
            names: map.names,
            mappings: map.mappings,
        }
    }
}

impl From<CoreCompilerDiagnostic> for CompilerDiagnostic {
    fn from(diagnostic: CoreCompilerDiagnostic) -> Self {
        Self {
            code: diagnostic.code,
            message: diagnostic.message,
            severity: match diagnostic.severity {
                DiagnosticSeverity::Error => "error",
                DiagnosticSeverity::Warning => "warning",
            }
            .into(),
            filename: diagnostic.filename,
            hint: diagnostic.hint,
            span: diagnostic.span.map(Into::into),
        }
    }
}

impl From<CoreSourceSpan> for SourceSpan {
    fn from(span: CoreSourceSpan) -> Self {
        Self {
            start: span.start.into(),
            end: span.end.into(),
        }
    }
}

impl From<CoreSourcePosition> for SourcePosition {
    fn from(position: CoreSourcePosition) -> Self {
        Self {
            offset: position.offset,
            line: position.line,
            column: position.column,
        }
    }
}
