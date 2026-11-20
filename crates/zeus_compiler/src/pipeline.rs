//! The order the compiler runs its stages in.
//!
//! This sequence used to live in the body of `transform_module`, interleaved
//! with five early-exit constructions of `TransformModuleResult`. Reading the
//! pipeline meant reading past `code: String::new(), map: None, …` five times,
//! and two of those exits built exactly the same result (the source, unchanged,
//! with no plans) without anything saying they were the same.
//!
//! What lives here is the *decision*: which stage runs next, and what a failure
//! at each stage returns. What does not live here is any stage's body — those
//! stay in `lower`, `passes`, `analysis` and `codegen`, each of which knows
//! what it does. This module only knows when.
//!
//! The rules it makes explicit:
//!
//! - Nesting is checked before the parser, because the parser is what the
//!   check protects.
//! - A module with nothing to lower is returned untouched, not re-emitted.
//! - SSR-only rejections run only for the SSR target, and run *before* any
//!   emission work.
//! - The hydration plan is computed before emission and attached after, so the
//!   emitter never needs to know the plan exists.
//!
//! [`TransformModuleResult`] is constructed in exactly three shapes here:
//! unchanged source, diagnostics with no code, and emitted code. A future stage
//! that needs a fourth shape has to add it deliberately rather than by copying
//! a `None`-filled literal.

use crate::{
    TransformModuleOptions, TransformModuleResult, TransformTarget, analysis, codegen, lower, ssr,
    support::diagnostic::CompilerDiagnostic,
};

/// Returns the source unchanged, without plans or diagnostics.
///
/// Two stages end this way: a module the lowerer found nothing to transform in,
/// and a module with no components, HMR calls, `defineElement` calls or SSR
/// imports. They are the same outcome, so they are the same function.
fn unchanged(source: &str) -> TransformModuleResult {
    TransformModuleResult {
        code: source.to_owned(),
        map: None,
        diagnostics: Vec::new(),
        hydration_plan: None,
        hmr_plan: None,
    }
}

/// Returns diagnostics and an empty program.
///
/// Code is empty rather than the input: a module that failed validation must
/// not be emitted as-is, or the caller ships a file the compiler rejected.
fn rejected(diagnostics: Vec<CompilerDiagnostic>) -> TransformModuleResult {
    TransformModuleResult {
        code: String::new(),
        map: None,
        diagnostics,
        hydration_plan: None,
        hmr_plan: None,
    }
}

/// Runs the compiler stages in order and returns what the caller asked for.
pub(crate) fn run(options: TransformModuleOptions) -> TransformModuleResult {
    // The nesting guard runs first: it exists to reject input the parser would
    // exhaust the stack on, so it cannot run after the parser.
    if let Some(diagnostic) = crate::nesting_diagnostic(&options) {
        return diagnostic;
    }

    let lowered = lower::lower_module(&options.source, &options.filename);
    if !lowered.diagnostics.is_empty() {
        return rejected(lowered.diagnostics);
    }

    let Some(ir) = lowered.ir else {
        return unchanged(&options.source);
    };

    // Nothing to transform: no components, and no feature the target asked for.
    if ir.components.is_empty()
        && (!options.hmr || lowered.hmr.render_calls.is_empty())
        && (!options.pure_define_element.is_enabled()
            || lowered.pure_define_element_calls.is_empty())
        && (options.target != TransformTarget::Ssr || lowered.ssr_runtime_imports.is_empty())
    {
        return unchanged(&options.source);
    }

    if options.target == TransformTarget::Ssr {
        // ErrorBoundary is a DOM boundary; the SSR target cannot represent it.
        if !lowered.error_boundary_spans.is_empty() {
            return rejected(
                lowered
                    .error_boundary_spans
                    .iter()
                    .map(|span| {
                        CompilerDiagnostic::error(
                            "ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED",
                            "ErrorBoundary is a Native DOM boundary and cannot be rendered by the SSR target.",
                            &options.filename,
                            Some(*span),
                        )
                    })
                    .collect(),
            );
        }

        let diagnostics = ssr::validate_ssr_properties(&ir, &options.filename);
        if !diagnostics.is_empty() {
            return rejected(diagnostics);
        }
    }

    // The hydration plan is a fact about the IR, computed before emission and
    // attached afterwards. This is why the emitter never consults it.
    let hydration_plan = analysis::hydration::build_hydration_plan(&ir);

    let mut result = match options.target {
        TransformTarget::Ssr => codegen::emit_ssr_module(&codegen::SsrModuleOptions {
            source: &options.source,
            filename: &options.filename,
            runtime_module: &options.runtime_module,
            source_map: options.source_map,
            module: &ir,
            reserved_names: &lowered.reserved_names,
            define_element_calls: &lowered.pure_define_element_calls,
            ssr_runtime_imports: &lowered.ssr_runtime_imports,
            auto_hydrate: options.auto_hydrate,
        }),
        TransformTarget::Dom => codegen::emit_module(&codegen::EmitModuleOptions {
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
            auto_hydrate: options.auto_hydrate,
        }),
    };
    result.hydration_plan = hydration_plan;
    result
}

/// Whether the module's inputs can produce any emitted code at all.
///
/// Exposed for tests that pin the "nothing to do" condition; the pipeline
/// itself folds this into the early exit above.
#[cfg(test)]
pub(crate) fn has_work(options: &TransformModuleOptions, lowered: &lower::LowerResult) -> bool {
    !lowered.ir.as_ref().is_some_and(|ir| {
        ir.components.is_empty()
            && (!options.hmr || lowered.hmr.render_calls.is_empty())
            && (!options.pure_define_element.is_enabled()
                || lowered.pure_define_element_calls.is_empty())
            && (options.target != TransformTarget::Ssr || lowered.ssr_runtime_imports.is_empty())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PureDefineElementMode;

    fn options(source: &str, target: TransformTarget) -> TransformModuleOptions {
        TransformModuleOptions {
            source: source.into(),
            filename: "pipeline.tsx".into(),
            target,
            runtime_module: "@zeus-js/runtime-dom".into(),
            delegate_events: false,
            source_map: false,
            hmr: false,
            pure_define_element: PureDefineElementMode::Disabled,
            auto_hydrate: false,
        }
    }

    #[test]
    fn a_module_with_nothing_to_lower_is_returned_byte_for_byte() {
        let source = "export const answer = 42\n";
        let result = run(options(source, TransformTarget::Dom));
        assert_eq!(result.code, source);
        assert!(result.diagnostics.is_empty());
        assert!(result.map.is_none());
        assert!(result.hydration_plan.is_none(), "nothing was lowered, so no plan");
    }

    #[test]
    fn a_rejected_module_emits_no_code() {
        // An ErrorBoundary under the SSR target is rejected, and the caller
        // must not receive the source as if it had compiled.
        let source = "import { ErrorBoundary } from '@zeus-js/zeus'\n\
             export const App = () => <ErrorBoundary><p>x</p></ErrorBoundary>\n";
        let result = run(options(source, TransformTarget::Ssr));
        assert!(!result.diagnostics.is_empty());
        assert_eq!(
            result.code, "",
            "rejected input must not come back as compilable code"
        );
    }

    #[test]
    fn the_hydration_plan_is_attached_after_emission() {
        let source = "export const App = () => <div>hi {1 + 1}</div>\n";
        let result = run(options(source, TransformTarget::Dom));
        assert!(!result.code.is_empty());
        assert!(
            result.hydration_plan.is_some(),
            "a lowered module carries a plan even when the target does not use it"
        );
    }
}
