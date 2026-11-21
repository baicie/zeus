//! Diagnostic codes that nothing exercised before.
//!
//! Ten codes were defined in the compiler and never asserted by any test. A
//! code that cannot be triggered is a code nobody knows works: the message may
//! name the wrong construct, the span may be `None`, or the branch may have
//! become unreachable behind a later check — and the suite stays green either
//! way.
//!
//! Each test below builds the smallest input that reaches its branch and
//! asserts the **specific** code. Asserting "there is a diagnostic" is not
//! enough: the `For` callback case already reports something, and that
//! something used to be `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION` rather than
//! the callback-parameter code it should be.

use zeus_compiler::{
    PureDefineElementMode, TransformModuleOptions, TransformTarget, transform_module,
};

fn dom(source: &str) -> zeus_compiler::TransformModuleResult {
    transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "diag.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/zeus".into(),
        delegate_events: true,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
        auto_hydrate: false,
    })
}

fn ssr(source: &str) -> zeus_compiler::TransformModuleResult {
    transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "diag.tsx".into(),
        target: TransformTarget::Ssr,
        runtime_module: "@zeus-js/zeus".into(),
        delegate_events: true,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
        auto_hydrate: false,
    })
}

/// Asserts `source` produces `code` and that the diagnostic carries a span.
fn expect_code(result: &zeus_compiler::TransformModuleResult, code: &str) {
    expect_code_with_span(result, code, true);
}

/// As [`expect_code`], but `has_span` says whether the diagnostic must carry a
/// position. The pre-parse nesting guard reports before Oxc has produced any
/// span, so it legitimately has none.
fn expect_code_with_span(
    result: &zeus_compiler::TransformModuleResult,
    code: &str,
    has_span: bool,
) {
    let codes: Vec<&str> = result.diagnostics.iter().map(|d| d.code.as_str()).collect();
    assert!(
        codes.contains(&code),
        "expected `{code}`, got {codes:?} with messages {:?}",
        result
            .diagnostics
            .iter()
            .map(|d| &d.message)
            .collect::<Vec<_>>()
    );
    let matched = result
        .diagnostics
        .iter()
        .find(|d| d.code == code)
        .expect("just asserted");
    if has_span {
        assert!(
            matched.span.is_some(),
            "`{code}` should name the offending span, not point at nothing"
        );
    }
    assert!(
        matched.severity != zeus_compiler::diagnostic::DiagnosticSeverity::Warning,
        "`{code}` is an error, not a warning"
    );
    // A rejected module must not come back as compilable code.
    assert_eq!(result.code, "", "a rejected module must emit no code");
}

#[test]
fn a_bare_function_attribute_is_reported() {
    let result = dom("export const A = () => <div title={() => 1} />\n");
    expect_code(&result, "ZEUS_FUNCTION_ATTRIBUTE");
}

#[test]
fn a_for_without_a_child_is_reported() {
    let result = dom("import { For } from '@zeus-js/zeus'\n\
         export const A = () => <For each={[]}></For>\n");
    expect_code(&result, "ZEUS_INVALID_FOR_CHILD");
}

#[test]
fn a_show_whose_fallback_cannot_be_lowered_is_reported() {
    // `contains_jsx` is true but the region cannot be built: `.map` with a
    // `function` callback instead of an arrow, which the array-map region
    // lowering requires. The fallback then has JSX in it that cannot be
    // lowered, which is exactly what this code reports.
    let result = dom("import { Show } from '@zeus-js/zeus'\n\
         export const A = () => (\n\
           <Show when={true} fallback={[1].map(function (n) { return <i>{n}</i> })}>\n\
             <p/>\n\
           </Show>\n\
         )\n");
    expect_code(&result, "ZEUS_INVALID_SHOW_FALLBACK");
}

#[test]
fn an_error_boundary_fallback_that_is_not_renderable_is_reported() {
    let result = dom("import { ErrorBoundary } from '@zeus-js/zeus'\n\
         export const A = () => <ErrorBoundary fallback={42}><p/></ErrorBoundary>\n");
    expect_code(&result, "ZEUS_INVALID_ERROR_BOUNDARY_FALLBACK");
}

#[test]
fn a_spread_on_a_builtin_is_reported() {
    let result = dom("import { Show } from '@zeus-js/zeus'\n\
         export const A = () => <Show {...{ when: true }}><p/></Show>\n");
    expect_code(&result, "ZEUS_UNSUPPORTED_BUILTIN_SPREAD");
}

#[test]
fn a_spread_child_is_reported() {
    let result = dom("export const A = () => <div>{...[1]}</div>\n");
    expect_code(&result, "ZEUS_UNSUPPORTED_SPREAD_CHILD");
}

#[test]
fn an_unsupported_raw_text_element_is_reported() {
    // `iframe` is one of the raw-text elements with no DOM binding path.
    // `script` and `style` are supported and must not be in this list.
    let result = dom("export const A = () => <iframe>a</iframe>\n");
    expect_code(&result, "ZEUS_UNSUPPORTED_RAW_TEXT_ELEMENT");
}

#[test]
fn an_error_boundary_under_the_ssr_target_is_reported() {
    // The boundary itself must lower cleanly; only the target rejects it.
    let result = ssr("import { ErrorBoundary } from '@zeus-js/zeus'\n\
         export const A = () => <ErrorBoundary fallback={() => <p>err</p>}><p/></ErrorBoundary>\n");
    expect_code(&result, "ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED");
}

#[test]
fn input_that_would_exhaust_the_parser_stack_is_rejected_before_parsing() {
    // The guard runs before Oxc, so this must be a diagnostic rather than an
    // abort. It counts depth, and the limit is 8,192; siblings do not add to
    // it. The span is legitimately absent: the check runs before any position
    // exists.
    let deep = format!(
        "export const A = () => {}{}\n",
        "<div>".repeat(9_000),
        "</div>".repeat(9_000)
    );
    let result = dom(&deep);
    expect_code_with_span(&result, "ZEUS_INPUT_TOO_DEEP", false);
}

#[test]
fn a_semantic_error_from_oxc_is_forwarded_with_its_own_span() {
    // A duplicate `const` binding is a semantic error the parser accepts.
    let result = dom("const a = 1\nconst a = 2\nexport const A = () => <div/>\n");
    let codes: Vec<&str> = result.diagnostics.iter().map(|d| d.code.as_str()).collect();
    assert!(
        codes.contains(&"ZEUS_SEMANTIC_ERROR"),
        "a duplicate binding must surface as ZEUS_SEMANTIC_ERROR, got {codes:?}"
    );
    let matched = result
        .diagnostics
        .iter()
        .find(|d| d.code == "ZEUS_SEMANTIC_ERROR")
        .expect("just asserted");
    assert!(matched.span.is_some(), "the Oxc span must be carried over");
}

#[test]
fn an_unimported_builtin_is_treated_as_an_ordinary_component() {
    // `<Show>` only becomes a builtin when `Show` is imported from the runtime
    // module. Without the import it is an ordinary component, and its JSX
    // `fallback` is then a JSX value in a component prop — which the compiler
    // rejects.
    //
    // This is worth pinning because it silently invalidated six golden
    // fixtures: they were written as `<Show ...>` without the import, took the
    // component path, were rejected, and snapshot the rejection under a name
    // that claims to cover control flow. The fixtures now import the builtin;
    // this test keeps the failure mode from being rediscovered as a bug.
    let imported = dom("import { Show } from '@zeus-js/runtime-dom'\n\
         export const A = (p) => <Show when={p.o} fallback={<p>c</p>}><p>open</p></Show>\n");
    assert!(
        imported.diagnostics.is_empty(),
        "with the import the element must be lowered as a builtin, got {:?}",
        imported
            .diagnostics
            .iter()
            .map(|d| &d.code)
            .collect::<Vec<_>>()
    );
    assert!(!imported.code.is_empty(), "the builtin form must emit code");

    let unimported =
        dom("export const A = (p) => <Show when={p.o} fallback={<p>c</p>}><p>open</p></Show>\n");
    let codes: Vec<&str> = unimported
        .diagnostics
        .iter()
        .map(|d| d.code.as_str())
        .collect();
    assert!(
        codes.contains(&"ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE"),
        "without the import the JSX fallback must be rejected as a component \
         prop, got {codes:?}"
    );
    assert_eq!(unimported.code, "");
}
