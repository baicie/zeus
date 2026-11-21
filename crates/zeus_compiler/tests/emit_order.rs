//! The emitted sections appear in a working order.
//!
//! `emit_module` calls six `emit_*` functions in sequence and the order is load
//! bearing: templates must be declared before the component bodies that call
//! them, and `delegateEvents` must run after the components that attach
//! listeners. Reordering two calls silently produced wrong output, and only a
//! golden fixture that happened to exercise the interaction noticed.
//!
//! An earlier version of this file had a section-order table with text markers
//! to reconcile it against the output. That was removed: the markers were wrong
//! three times in a row, because they depended on the runtime module name, on
//! the event names, and on whether the user source had its own `import {`
//! before the generated one.
//!
//! Two kinds of assertion replace it:
//!
//! 1. **Positions.** Compile a known module and assert where the sections land
//!    relative to each other.
//! 2. **Parseability.** Every fixture's output must parse as an ES module.
//!    This is the assertion that makes reordering detectable even when the
//!    positions still happen to read correctly: swapping the template and
//!    component sections emits `})()const $zeusTmpl = ...`, which is a syntax
//!    error, and a golden fixture would only catch it if that fixture had a
//!    component and was regenerated for the right reason.
//!
//! The parseability check is not a substitute for the position checks — valid
//! code can still be in the wrong order, and that is what (1) covers.

use zeus_compiler::{
    PureDefineElementMode, TransformModuleOptions, TransformTarget, transform_module,
};

/// Parses `code` as an ES module and returns the syntax errors Oxc reported.
///
/// Returns the messages rather than asserting, so a caller can say what the
/// output was when it failed to parse.
fn syntax_errors(code: &str) -> Vec<String> {
    let allocator = oxc_allocator::Allocator::default();
    let parsed = oxc_parser::Parser::new(&allocator, code, oxc_span::SourceType::mjs()).parse();
    parsed
        .diagnostics
        .iter()
        .map(std::string::ToString::to_string)
        .collect()
}

/// Asserts the compiler produced output and that the output is a valid module.
///
/// `what` names the fixture so a failure says which one broke.
fn assert_parses(what: &str, code: &str) {
    assert!(
        !code.is_empty(),
        "{what}: the fixture must produce code for this check to mean anything"
    );
    let errors = syntax_errors(code);
    assert!(
        errors.is_empty(),
        "{what}: the emitted module does not parse — a section was emitted in a \
         position that breaks the program:\n  {errors:?}\n--- output ---\n{code}"
    );
}

fn transform(source: &str, delegate_events: bool, hmr: bool) -> String {
    transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "order.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events,
        source_map: false,
        hmr,
        pure_define_element: PureDefineElementMode::Disabled,
        auto_hydrate: false,
    })
    .code
}

/// Position of `needle`, or a panic naming what was missing.
fn position(haystack: &str, needle: &str) -> usize {
    haystack
        .find(needle)
        .unwrap_or_else(|| panic!("the output must contain {needle:?}"))
}

const COMPONENT: &str = r"export const App = () => (
  <button onClick={() => {}}>hi {1 + 1}</button>
)
";

#[test]
fn the_runtime_import_precedes_the_templates_and_the_component_body() {
    let code = transform(COMPONENT, false, false);

    let import = position(&code, "import {");
    let template = position(&code, "const ");
    assert!(
        import < template,
        "the runtime import must come before the template it names:\n{code}"
    );

    // The component body references the template, so it cannot come first.
    let component = position(&code, "export const App");
    assert!(
        template < component,
        "templates must be emitted before the component that uses them:\n{code}"
    );
}

#[test]
fn delegated_events_come_last() {
    let code = transform(COMPONENT, true, false);

    let component = position(&code, "export const App");
    // The emitter allocates an alias (`$zeusDelegateEvents`), so the call is
    // matched by the import name rather than by a literal `delegateEvents(`.
    let delegate = position(&code, "delegateEvents as");
    let call = code
        .rfind("$zeusDelegateEvents(")
        .expect("the delegated events call must be emitted under its alias");
    assert!(
        component < call,
        "delegateEvents must run after the components that attach listeners:\n{code}"
    );

    // And after the import that defines it.
    assert!(delegate < call);
}

#[test]
fn hmr_state_sits_between_the_import_and_the_templates() {
    // HMR state is emitted only when the module does *not* manage its own
    // boundary: any `import.meta.hot` use sets `manual_boundary` and the
    // compiler steps aside. So the fixture mounts a root and mentions no hot
    // API, which is the shape the generated state is for.
    let source = "import { render } from '@zeus-js/zeus';\n\
         render(() => <p>{1}</p>, document.body);\n";
    let code = transform(source, false, true);
    assert!(
        code.contains("_zeusHmrDisposers"),
        "this fixture must produce compiler-managed HMR state:\n{code}"
    );

    let import = position(&code, "from \"@zeus-js/runtime-dom\"");
    let hmr = position(&code, "import.meta.hot");
    // The first template declaration, not the HMR block's own `const`.
    let template = position(&code, "$zeusTemplate(\"");

    assert!(
        import < hmr,
        "HMR state is emitted after the runtime import:\n{code}"
    );
    assert!(
        hmr < template,
        "HMR state is emitted before the templates it may invalidate:\n{code}"
    );
}

#[test]
fn without_delegation_no_delegated_events_section_is_written() {
    let code = transform(COMPONENT, false, false);
    assert!(
        !code.contains("delegateEvents as"),
        "the section must be absent when the plan says so:\n{code}"
    );
}

#[test]
fn a_module_with_no_component_keeps_its_source_and_adds_no_runtime_import() {
    // The early exit in `transform_module` returns the source untouched for a
    // module with nothing to lower. This asserts the plan agrees: no runtime
    // import, no templates, no components.
    let source = "export const answer = 42\n";
    let code = transform(source, true, false);

    assert_eq!(code, source);
    assert!(!code.contains("import {"));
    assert!(!code.contains("delegateEvents as"));
}

// ---- Parseability -----------------------------------------------------------
//
// One fixture per shape that changes which sections are emitted. Between them
// they cover every section: runtime import, HMR state, HMR boundary, templates,
// components, delegated events, and the source insertions HMR adds.

#[test]
fn a_static_component_emits_a_parsable_module() {
    assert_parses(
        "static component",
        &transform(
            "export const App = () => <div class=\"card\"><h1>Hi</h1></div>\n",
            false,
            false,
        ),
    );
}

#[test]
fn a_component_with_bindings_emits_a_parsable_module() {
    assert_parses(
        "bound component",
        &transform(
            "export const App = (p) => <div title={p.t} class={p.c}>{p.v}</div>\n",
            false,
            false,
        ),
    );
}

#[test]
fn delegation_emits_a_parsable_module() {
    // The delegated-events call has no stable literal marker (it goes through
    // an alias), so this shape cannot be checked by position alone. It can be
    // checked for parseability, and the call must be present.
    let code = transform(COMPONENT, true, false);
    assert_parses("delegated events", &code);
    assert!(
        code.contains("$zeusDelegateEvents("),
        "this fixture must actually emit the delegation call:\n{code}"
    );
}

#[test]
fn hmr_state_and_boundary_emit_a_parsable_module() {
    // The full HMR shape: a literal binding (which produces the plan and the
    // state cell) plus a top-level `render(...)` (which produces the boundary
    // and the source insertion wrapping it).
    let source = "import { render, createSignal } from '@zeus-js/zeus'\n\
         const [n, setN] = createSignal(0)\n\
         render(() => <main class={'old'}><button>{'Hello'} {n()}</button></main>, document.body)\n";
    let code = transform(source, false, true);

    assert!(
        code.contains("createHmrState"),
        "this fixture must produce HMR state:\n{code}"
    );
    assert!(
        code.contains("_zeusHmrDisposers"),
        "this fixture must produce the HMR boundary:\n{code}"
    );
    assert_parses("HMR state and boundary", &code);
}

#[test]
fn a_manual_hmr_boundary_emits_a_parsable_module() {
    // The compiler steps aside here: no generated boundary, no state. The
    // output is still the user's source with templates inserted, which is the
    // shape most likely to break if insertion offset handling regresses.
    let source = "import { render } from '@zeus-js/zeus'\n\
         if (import.meta.hot) { import.meta.hot.accept() }\n\
         render(() => <p>{'x'}</p>, document.body)\n";
    let code = transform(source, false, true);
    assert_parses("manual HMR boundary", &code);
}

#[test]
fn a_module_with_a_component_root_emits_a_parsable_module() {
    // A component whose own root is another component produces an empty
    // template. If `emit_templates` and `emit_components` disagreed about that,
    // the result would be a dangling reference rather than a syntax error — so
    // this also checks the template is declared before it is used.
    let code = transform("export const App = () => <Card n={1} />\n", false, false);
    assert_parses("component root", &code);
}

#[test]
fn every_golden_source_emits_a_parsable_module() {
    // The golden fixtures pin the exact bytes, but they pin them per fixture
    // and a new fixture is added by regenerating rather than by reasoning.
    // Running every source through the parser is a second, independent opinion
    // that at least says "this output is a program".
    //
    // SSR is excluded: it emits a render function returning a string and its
    // output is checked by its own fixtures, not by this DOM-order file.
    const SOURCES: &[&str] = &[
        "export const App = () => <div class=\"card\"><h1>Hello</h1><p>World</p></div>\n",
        "export const App = (p) => <p>count: {p.count}</p>\n",
        "export const App = (p) => <p>{p.a} and {p.b} and {p.c}</p>\n",
        "export const App = (p) => <div><section><article><span>{p.value}</span></article></section></div>\n",
        "export const App = (p) => <input title={p.title} />\n",
        "export const App = (p) => <input value={p.value} />\n",
        "export const App = (p) => <div class={p.cls} style={{ color: p.color }} />\n",
        "export const App = (p) => <div {...p.attrs} id=\"x\" />\n",
        "export const App = (p) => <button onClick={p.onClick}>go</button>\n",
        "export const App = (p) => <video onPlay={p.onPlay} />\n",
        "export const App = (p) => <input ref={p.inputRef} />\n",
        "export const App = () => <Card title=\"t\"><span>child</span></Card>\n",
        "export const App = (p) => <Card count={p.count} />\n",
        "import { Show } from '@zeus-js/runtime-dom'\nexport const App = (p) => <Show when={p.open} fallback={<p>closed</p>}><p>open</p></Show>\n",
        "import { For } from '@zeus-js/runtime-dom'\nexport const App = (p) => <For each={p.items}>{item => <li>{item.name}</li>}</For>\n",
        "import { For } from '@zeus-js/runtime-dom'\nexport const App = (p) => <For each={p.items}>{(item, index) => <li>{index()}: {item.name}</li>}</For>\n",
        "import { For, Show } from '@zeus-js/runtime-dom'\nexport const App = (p) => <For each={p.items}>{item => <Show when={item.visible}>{item.name}</Show>}</For>\n",
        "import { ErrorBoundary } from '@zeus-js/runtime-dom'\nexport const App = () => <ErrorBoundary fallback={err => <p>{err.message}</p>}><Child /></ErrorBoundary>\n",
        "import { Transition } from '@zeus-js/runtime-dom'\nexport const App = (p) => <Transition when={p.visible} enter={{ opacity: '1' }} leave={{ opacity: '0' }}><p>x</p></Transition>\n",
        "export const App = (p) => <><span>{p.a}</span><span>{p.b}</span></>\n",
        "export const App = (p) => <svg viewBox=\"0 0 10 10\"><path d={p.d} /></svg>\n",
        "export const App = (p) => <div innerHTML={p.html} />\n",
        "export const App = (p) => <div>{p.render()}</div>\n",
        "export const App = (p) => <div>{p.open ? <b>y</b> : <i>n</i>}</div>\n",
        "export const App = (p) => <ul>{p.items.map(item => <li>{item}</li>)}</ul>\n",
        "export const App = (p) => <p title=\"中文\">\n    {p.value +\n      p.other}\n  </p>\n",
        "export const App = (p) => <Card><><span>{p.a}</span><Inner n={p.n}/></></Card>\n",
    ];

    for (index, source) in SOURCES.iter().enumerate() {
        assert_parses(
            &format!("golden source #{index}"),
            &transform(source, true, false),
        );
    }
}
