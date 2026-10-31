//! Thin Node-API adapter for the Zeus Rust compiler.

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

// Measured with the 64 MiB worker stack below: JSX overflows at about 23,000
// levels and object literals, arrow chains and ternaries abort below 32,700,
// while every construct still compiles at 12,288 in both targets. The limit
// keeps at least 1.5x of that margin; real code never nests this deep.
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
    };

    if exceeds_input_nesting_depth(&core_options.source) {
        return Ok(CoreTransformModuleResult {
            code: String::new(),
            map: None,
            diagnostics: vec![CoreCompilerDiagnostic {
                code: "ZEUS_INPUT_TOO_DEEP".into(),
                message: format!(
                    "Input nesting depth exceeds the supported limit of {MAX_INPUT_NESTING_DEPTH}."
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

/// Detects pathological nesting before Oxc gets a chance to recurse through it.
/// The scan deliberately accepts false positives in malformed input: returning
/// a compiler diagnostic is safer than letting a parser stack overflow abort
/// the host process. Strings and comments are skipped so ordinary source text
/// containing brackets or JSX-looking examples is unaffected.
fn exceeds_input_nesting_depth(source: &str) -> bool {
    let bytes = source.as_bytes();
    let mut index = 0;
    let mut depth = 0usize;
    let mut jsx_depth = 0usize;
    let mut state = ScanState::Code;

    while index < bytes.len() {
        let byte = bytes[index];
        match state {
            ScanState::Code => match byte {
                b'/' if bytes.get(index + 1) == Some(&b'/') => {
                    state = ScanState::LineComment;
                    index += 2;
                }
                b'/' if bytes.get(index + 1) == Some(&b'*') => {
                    state = ScanState::BlockComment;
                    index += 2;
                }
                b'\'' => {
                    state = ScanState::SingleQuote;
                    index += 1;
                }
                b'"' => {
                    state = ScanState::DoubleQuote;
                    index += 1;
                }
                b'`' => {
                    state = ScanState::Template;
                    index += 1;
                }
                b'(' | b'[' | b'{' => {
                    depth += 1;
                    if depth.saturating_add(jsx_depth) > MAX_INPUT_NESTING_DEPTH {
                        return true;
                    }
                    index += 1;
                }
                b')' | b']' | b'}' => {
                    depth = depth.saturating_sub(1);
                    index += 1;
                }
                b'<' if looks_like_jsx_tag(bytes, index) => {
                    let closing = bytes.get(index + 1) == Some(&b'/');
                    let (end, self_closing) = scan_jsx_tag(bytes, index);
                    if closing {
                        jsx_depth = jsx_depth.saturating_sub(1);
                    } else if !self_closing {
                        jsx_depth += 1;
                        if depth.saturating_add(jsx_depth) > MAX_INPUT_NESTING_DEPTH {
                            return true;
                        }
                    }
                    index = end;
                }
                _ => index += 1,
            },
            ScanState::LineComment => {
                index += 1;
                if byte == b'\n' {
                    state = ScanState::Code;
                }
            }
            ScanState::BlockComment => {
                if byte == b'*' && bytes.get(index + 1) == Some(&b'/') {
                    state = ScanState::Code;
                    index += 2;
                } else {
                    index += 1;
                }
            }
            ScanState::SingleQuote | ScanState::DoubleQuote | ScanState::Template => {
                let quote = match state {
                    ScanState::SingleQuote => b'\'',
                    ScanState::DoubleQuote => b'"',
                    ScanState::Template => b'`',
                    ScanState::Code | ScanState::LineComment | ScanState::BlockComment => {
                        unreachable!()
                    }
                };
                if byte == b'\\' {
                    index = (index + 2).min(bytes.len());
                } else {
                    index += 1;
                    if byte == quote {
                        state = ScanState::Code;
                    }
                }
            }
        }
    }

    false
}

#[derive(Clone, Copy)]
enum ScanState {
    Code,
    SingleQuote,
    DoubleQuote,
    Template,
    LineComment,
    BlockComment,
}

fn looks_like_jsx_tag(bytes: &[u8], index: usize) -> bool {
    match bytes.get(index + 1) {
        Some(b'/' | b'>') => true,
        Some(byte) => byte.is_ascii_alphabetic() || *byte == b'_',
        None => false,
    }
}

fn scan_jsx_tag(bytes: &[u8], start: usize) -> (usize, bool) {
    let mut index = start + 1;
    let mut quote = None;
    while index < bytes.len() {
        let byte = bytes[index];
        if let Some(expected) = quote {
            if byte == b'\\' {
                index = (index + 2).min(bytes.len());
                continue;
            }
            if byte == expected {
                quote = None;
            }
        } else if byte == b'\'' || byte == b'"' {
            quote = Some(byte);
        } else if byte == b'>' {
            let mut previous = index;
            while previous > start && bytes[previous - 1].is_ascii_whitespace() {
                previous -= 1;
            }
            return (index + 1, previous > start && bytes[previous - 1] == b'/');
        }
        index += 1;
    }
    (bytes.len(), false)
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
