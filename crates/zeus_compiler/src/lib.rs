mod codegen;
mod html;
pub mod hydration;

pub mod diagnostic;
pub mod ir;
pub mod lower;
pub mod span;

use serde::{Deserialize, Serialize};

use diagnostic::CompilerDiagnostic;
use hydration::HydrationPlan;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransformTarget {
    Dom,
    Ssr,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "bool", into = "bool")]
pub enum PureDefineElementMode {
    #[default]
    Disabled,
    Enabled,
}

impl PureDefineElementMode {
    pub(crate) const fn is_enabled(self) -> bool {
        matches!(self, Self::Enabled)
    }
}

impl From<bool> for PureDefineElementMode {
    fn from(enabled: bool) -> Self {
        if enabled {
            Self::Enabled
        } else {
            Self::Disabled
        }
    }
}

impl From<PureDefineElementMode> for bool {
    fn from(mode: PureDefineElementMode) -> Self {
        mode.is_enabled()
    }
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
    #[serde(default)]
    pub hmr: bool,
    #[serde(default)]
    pub pure_define_element: PureDefineElementMode,
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
    pub hydration_plan: Option<HydrationPlan>,
}

pub fn transform_module(options: TransformModuleOptions) -> TransformModuleResult {
    let lowered = lower::lower_module(&options.source, &options.filename);
    if !lowered.diagnostics.is_empty() {
        return TransformModuleResult {
            code: String::new(),
            map: None,
            diagnostics: lowered.diagnostics,
            hydration_plan: None,
        };
    }

    let Some(ir) = lowered.ir else {
        return TransformModuleResult {
            code: options.source,
            map: None,
            diagnostics: Vec::new(),
            hydration_plan: None,
        };
    };

    if ir.components.is_empty()
        && (!options.hmr || lowered.hmr.render_calls.is_empty())
        && (!options.pure_define_element.is_enabled()
            || lowered.pure_define_element_calls.is_empty())
        && (options.target != TransformTarget::Ssr || lowered.ssr_runtime_imports.is_empty())
    {
        return TransformModuleResult {
            code: options.source,
            map: None,
            diagnostics: Vec::new(),
            hydration_plan: None,
        };
    }

    if options.target == TransformTarget::Ssr && !lowered.error_boundary_spans.is_empty() {
        return TransformModuleResult {
            code: String::new(),
            map: None,
            diagnostics: lowered.error_boundary_spans.iter().map(|span| {
                CompilerDiagnostic::error(
                    "ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED",
                    "ErrorBoundary is a Native DOM boundary and cannot be rendered by the SSR target.",
                    &options.filename,
                    Some(*span),
                )
            }).collect(),
            hydration_plan: None,
        };
    }

    let hydration_plan = hydration::build_hydration_plan(&ir);
    let mut result = if options.target == TransformTarget::Ssr {
        codegen::emit_ssr_module(
            &options.source,
            &options.filename,
            &options.runtime_module,
            options.source_map,
            &ir,
            &lowered.reserved_names,
            &lowered.pure_define_element_calls,
            &lowered.ssr_runtime_imports,
        )
    } else {
        codegen::emit_module(&codegen::EmitModuleOptions {
            source: &options.source,
            filename: &options.filename,
            runtime_module: &options.runtime_module,
            enable_delegation: options.delegate_events,
            source_map: options.source_map,
            module: &ir,
            reserved_names: &lowered.reserved_names,
            enable_hmr: options.hmr,
            hmr: &lowered.hmr,
            pure_define_element: options.pure_define_element,
            pure_define_element_calls: &lowered.pure_define_element_calls,
        })
    };
    result.hydration_plan = hydration_plan;
    result
}
