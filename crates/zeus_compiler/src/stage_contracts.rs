//! Contracts passed from lowering to later stages.
//!
//! These types are produced by lowering and consumed by codegen, but they are
//! not lowering's private business: `codegen` importing `crate::lower::HmrInfo`
//! made the emitter depend on an implementation module, so a change to how
//! lowering collects HMR information was indistinguishable from a change to the
//! contract.
//!
//! They live here instead — a neutral module both stages may name. This is not
//! a home for every side channel: each type below is here because a stage
//! other than lowering reads it. Lowering's own working state stays in
//! `lower.rs`.
//!
//! Nothing in this module reads or writes the IR, and it imports no stage.

use oxc_span::Span;

/// How a module's HMR boundary looks from lowering's point of view.
///
/// `manual_boundary` means the source already contains `import.meta.hot`, so
/// the compiler must not synthesise one. `render_calls` are the top-level
/// `render(...)` invocations a generated boundary has to wrap.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) struct HmrInfo {
    pub(crate) manual_boundary: bool,
    pub(crate) render_calls: Vec<HmrRenderCall>,
}

/// One top-level `render(...)` call, named by source offsets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HmrRenderCall {
    pub(crate) offset: u32,
    pub(crate) end: u32,
    pub(crate) terminate_statement: bool,
}

/// A source replacement the SSR emitter applies to one import statement.
///
/// A statement whose bindings are all served by the SSR facade only needs its
/// module source rewritten. A mixed statement is split instead: the facade
/// names move to a new import statement and the remaining client-only names
/// keep importing from the original module.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SsrImportRewrite {
    /// Span of the whole statement, replaced verbatim.
    pub(crate) span: Span,
    pub(crate) replacement: SsrImportReplacement,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SsrImportReplacement {
    /// Replace only the module specifier string of an all-facade import.
    ModuleSource,
    /// Split the statement into a facade import and a client import.
    Split {
        /// Verbatim specifier source text, in original order.
        facade: Vec<String>,
        client: Vec<String>,
        /// Original module, which keeps serving the client-only names.
        module: String,
    },
}
