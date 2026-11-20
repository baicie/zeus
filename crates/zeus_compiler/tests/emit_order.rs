//! The emitted sections appear in the order `EmitSection::ORDER` states.
//!
//! The order matters and nothing used to check it. `emit_module` called six
//! `emit_*` functions in sequence; moving one line changed behaviour and only
//! a golden fixture that happened to exercise the interaction would notice.
//!
//! These tests read the actual generated code and assert that the markers
//! appear in the declared order. They cannot see a section that emits no
//! stable marker (`EmitSection::marker()` returns `None` for those, and they
//! are skipped rather than guessed at), but every section that *can* be
//! located in the output is checked.

use zeus_compiler::{
    PureDefineElementMode, TransformModuleOptions, TransformTarget, transform_module,
};

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
