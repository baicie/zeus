//! Thin Node-API adapter for the Zeus Rust compiler.

mod nesting;

use napi::{Error, Result, Status};
use napi_derive::napi;
use zeus_compiler::{
    PureDefineElementMode, RawSourceMap as CoreRawSourceMap,
    TransformModuleOptions as CoreTransformModuleOptions,
    TransformModuleResult as CoreTransformModuleResult, TransformTarget,
    diagnostic::{CompilerDiagnostic as CoreCompilerDiagnostic, DiagnosticSeverity},
    hydration::{
        HydrationBindingPlan as CoreHydrationBindingPlan,
        HydrationComponentPlan as CoreHydrationComponentPlan,
        HydrationNodePlan as CoreHydrationNodePlan, HydrationPlan as CoreHydrationPlan,
    },
    span::{SourcePosition as CoreSourcePosition, SourceSpan as CoreSourceSpan},
};

/// Documented nesting limit, expressed in JSX element levels by `nesting.rs`.
const MAX_INPUT_NESTING_DEPTH: usize = 8_192;

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
    pub pure_define_element: Option<bool>,
    pub auto_hydrate: Option<bool>,
}

#[napi(object, use_nullable = true)]
pub struct TransformModuleResult {
    pub code: String,
    pub map: Option<RawSourceMap>,
    pub diagnostics: Vec<CompilerDiagnostic>,
    pub hydration_plan: Option<HydrationPlan>,
}

#[napi(object)]
pub struct HydrationPlan {
    pub version: u8,
    pub components: Vec<HydrationComponentPlan>,
}

#[napi(object)]
pub struct HydrationComponentPlan {
    pub id: u32,
    pub template_id: String,
    pub nodes: Vec<HydrationNodePlan>,
}

#[napi(object)]
pub struct HydrationNodePlan {
    pub id: String,
    pub node_id: u32,
    pub kind: String,
    pub optional: bool,
    pub tag_name: Option<String>,
    pub bindings: Vec<HydrationBindingPlan>,
}

#[napi(object)]
pub struct HydrationBindingPlan {
    pub id: u32,
    pub kind: String,
    pub name: Option<String>,
    pub once: bool,
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

    let core_options = CoreTransformModuleOptions {
        source: options.source,
        filename: options.filename,
        target,
        runtime_module: options.runtime_module,
        delegate_events: options.delegate_events,
        source_map: options.source_map,
        hmr: options.hmr.unwrap_or(false),
        pure_define_element: PureDefineElementMode::from(
            options.pure_define_element.unwrap_or(false),
        ),
        auto_hydrate: options.auto_hydrate.unwrap_or(false),
    };

    if nesting::exceeds_nesting_cost(&core_options.source) {
        return Ok(CoreTransformModuleResult {
            code: String::new(),
            map: None,
            diagnostics: vec![CoreCompilerDiagnostic {
                code: "ZEUS_INPUT_TOO_DEEP".into(),
                message: format!(
                    "Input nesting exceeds the supported limit of {MAX_INPUT_NESTING_DEPTH} levels."
                ),
                severity: DiagnosticSeverity::Error,
                filename: core_options.filename.clone(),
                hint: Some(
                    "Split deeply nested JSX or JavaScript expressions into smaller components or helpers."
                        .into(),
                ),
                span: None,
            }],
            hydration_plan: None,
        }
        .into());
    }

    // Oxc's recursive parser, the semantic builder and lowering all recurse per
    // JSX nesting level. A Node.js main thread overflows at a few thousand
    // levels, and a Rust stack overflow aborts the whole host process, so run
    // the transform on a dedicated thread whose stack is sized for input tens
    // of thousands of levels deep. This raises the limit; it does not turn an
    // overflow into a diagnostic.
    let worker = std::thread::Builder::new()
        .name("zeus-compiler".into())
        .stack_size(64 * 1024 * 1024)
        .spawn(move || zeus_compiler::transform_module(core_options))
        .map_err(|error| Error::new(Status::GenericFailure, error.to_string()))?;
    let result = worker.join().map_err(|_| {
        Error::new(
            Status::GenericFailure,
            "Zeus compiler worker panicked while transforming the module.",
        )
    })?;

    Ok(result.into())
}

impl From<CoreTransformModuleResult> for TransformModuleResult {
    fn from(result: CoreTransformModuleResult) -> Self {
        Self {
            code: result.code,
            map: result.map.map(Into::into),
            diagnostics: result.diagnostics.into_iter().map(Into::into).collect(),
            hydration_plan: result.hydration_plan.map(Into::into),
        }
    }
}

impl From<CoreHydrationPlan> for HydrationPlan {
    fn from(plan: CoreHydrationPlan) -> Self {
        Self {
            version: plan.version,
            components: plan.components.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<CoreHydrationComponentPlan> for HydrationComponentPlan {
    fn from(component: CoreHydrationComponentPlan) -> Self {
        Self {
            id: component.id,
            template_id: component.template_id,
            nodes: component.nodes.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<CoreHydrationNodePlan> for HydrationNodePlan {
    fn from(node: CoreHydrationNodePlan) -> Self {
        Self {
            id: node.id,
            node_id: node.node_id,
            kind: node.kind,
            optional: node.optional,
            tag_name: node.tag_name,
            bindings: node.bindings.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<CoreHydrationBindingPlan> for HydrationBindingPlan {
    fn from(binding: CoreHydrationBindingPlan) -> Self {
        Self {
            id: binding.id,
            kind: binding.kind,
            name: binding.name,
            once: binding.once,
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
