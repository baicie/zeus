mod analysis;
mod codegen;
pub mod ir;
pub mod lower;
mod passes;
mod pipeline;
mod ssr;
mod stage_contracts;
pub mod support;

pub use support::{diagnostic, span};
pub use support::{hmr, hydration, nesting};

use serde::{Deserialize, Serialize};

use support::diagnostic::CompilerDiagnostic;
use support::hydration::HydrationPlan;

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

// These flags are independent compiler switches rather than mutually exclusive
// states, so collapsing them into enums would only obscure the public options.
#[allow(clippy::struct_excessive_bools)]
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
    /// Emits a second, marker-driven adoption body per component so
    /// `render(value, container, { hydrate: true })` can reuse server markup.
    #[serde(default)]
    pub auto_hydrate: bool,
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
    pub hmr_plan: Option<hmr::HmrPlan>,
}

/// Both hosts run this same entry point. Reject input that would exhaust the
/// parser's stack before Oxc sees it, so a Node worker abort or a WebAssembly
/// trap becomes an ordinary diagnostic instead. An unrecognized extension is
/// left to `lower_module`, which reports `ZEUS_UNSUPPORTED_SOURCE_TYPE`.
pub(crate) fn nesting_diagnostic(options: &TransformModuleOptions) -> Option<TransformModuleResult> {
    let source_type = oxc_span::SourceType::from_path(&options.filename).ok()?;
    if !nesting::exceeds_nesting_cost_with_jsx(&options.source, source_type.is_jsx()) {
        return None;
    }
    Some(TransformModuleResult {
        code: String::new(),
        map: None,
        diagnostics: vec![CompilerDiagnostic::error(
            "ZEUS_INPUT_TOO_DEEP",
            format!(
                "Input nesting exceeds the supported limit of {} levels.",
                nesting::MAX_INPUT_NESTING_DEPTH
            ),
            options.filename.as_str(),
            None,
        )
        .with_hint(
            "Split deeply nested JSX or JavaScript expressions into smaller components or helpers.",
        )],
        hydration_plan: None,
        hmr_plan: None,
    })
}

pub fn transform_module(options: TransformModuleOptions) -> TransformModuleResult {
    // The stage order and what each stage returns live in `pipeline`. Keeping
    // it in one place means a new early exit has to be written once, as a
    // named shape, instead of copied as another `None`-filled literal.
    pipeline::run(options)
}
