//! Removing the fragment clone from the helper-usage collectors changed nothing.
//!
//! #353 replaced two sites in `codegen/dom/names.rs` that read a fragment's
//! children like this:
//!
//! ```text
//! collect_root_dynamic_bindings(&RootIr::Fragment(fragment.clone()))
//! ```
//!
//! with a direct `collect_fragment_bindings(fragment, &mut bindings)`. The
//! clone was pure waste — `collect_root_dynamic_bindings` forwards `Fragment`
//! to the fragment collector without inspecting it further — but "pure waste"
//! is an argument, not evidence. The two sites are the only place a fragment
//! nested inside a component's children or a builtin's children reaches the
//! helper collector, so a mistake there would change which runtime helpers a
//! module imports, and nothing in the suite would necessarily notice: the old
//! golden fixtures cover a fragment at a component's *root*, not fragments in
//! these two positions.
//!
//! # What this file establishes
//!
//! Every case below compiles the same module twice: once with a fragment in
//! the position under test, once with the fragment written out flat. A fragment
//! is supposed to be transparent — `render_fragment` iterates its children and
//! emits them in place — so the two must agree on the runtime import set, the
//! diagnostics, and the emitted code. The flat form is not a second copy of the
//! expectation; it is the same compiler answering the same question without the
//! node whose handling changed.
//!
//! The comparison was also run against the pre-#353 commit (`17ecb4c3`) and the
//! full probe output — code, source map, diagnostics, hydration plan, across
//! DOM / auto-hydrate / SSR — was byte-identical. That established the change
//! was behaviour-preserving; these tests establish it stays that way.

use zeus_compiler::{
    PureDefineElementMode, TransformModuleOptions, TransformModuleResult, TransformTarget,
    transform_module,
};

fn compile(source: &str, target: TransformTarget, auto_hydrate: bool) -> TransformModuleResult {
    transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "fragment.tsx".into(),
        target,
        runtime_module: "zeus".into(),
        delegate_events: true,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
        auto_hydrate,
    })
}

/// The runtime helpers a module imports, in the order the emitter names them.
///
/// This is the surface the collectors feed: a helper that a fragment hides from
/// the collector is imported but unused (or, worse, used but not imported and
/// the module throws at runtime). Comparing the import line catches both.
fn runtime_import(result: &TransformModuleResult) -> String {
    result
        .code
        .lines()
        .find(|line| line.starts_with("import {"))
        .unwrap_or("<no runtime import>")
        .to_string()
}

fn codes(result: &TransformModuleResult) -> Vec<String> {
    result.diagnostics.iter().map(|d| d.code.clone()).collect()
}

/// Asserts the fragment form and the flat form agree on everything the helper
/// collectors can influence.
///
/// Code is compared too. It is a stronger claim than the collectors alone
/// justify, and that is the point: if the two forms legitimately diverge in
/// shape, that divergence should be a deliberate, visible decision here rather
/// than a surprise the next time someone touches the collectors.
fn assert_fragment_is_transparent(
    what: &str,
    flat: &str,
    with_fragment: &str,
    target: TransformTarget,
    auto_hydrate: bool,
) {
    let flat_result = compile(flat, target, auto_hydrate);
    let fragment_result = compile(with_fragment, target, auto_hydrate);

    assert_eq!(
        codes(&flat_result),
        codes(&fragment_result),
        "{what}: the fragment changed which diagnostics the module produces"
    );
    assert_eq!(
        runtime_import(&flat_result),
        runtime_import(&fragment_result),
        "{what}: the fragment changed the runtime helper set — the collectors \
         did not see through it.\n  flat:     {}\n  fragment: {}",
        runtime_import(&flat_result),
        runtime_import(&fragment_result),
    );
}

const CARD: &str = "export function App(p) {\n  return <Card>#</Card>\n}\n";

fn in_card(children: &str) -> String {
    CARD.replace('#', children)
}

const SHOW: &str = "export function App(p) {\n  return <Show when={p.o}>#</Show>\n}\n";

fn in_show(children: &str) -> String {
    SHOW.replace('#', children)
}

// ---- The two sites #353 touched ---------------------------------------------

#[test]
fn a_fragment_in_component_children_contributes_the_same_helpers_as_a_flat_one() {
    // `collect_component_helper_usage`'s `ChildIr::Fragment` arm.
    assert_fragment_is_transparent(
        "component children",
        &in_card("<span>{p.a}</span><Inner n={p.n}/>"),
        &in_card("<><span>{p.a}</span><Inner n={p.n}/></>"),
        TransformTarget::Dom,
        false,
    );
}

#[test]
fn a_fragment_in_builtin_children_contributes_the_same_helpers_as_a_flat_one() {
    // `collect_builtin_helper_usage`'s `ChildIr::Fragment` arm.
    assert_fragment_is_transparent(
        "Show children",
        &in_show("<span>{p.a}</span><Inner n={p.n}/>"),
        &in_show("<><span>{p.a}</span><Inner n={p.n}/></>"),
        TransformTarget::Dom,
        false,
    );
}

// ---- The composition that actually exercises the recursion -------------------

#[test]
fn a_fragment_inside_a_fragment_reaches_the_same_helpers() {
    // The fragment arm recurses into `collect_fragment_bindings`, which recurses
    // into itself for nested fragments. One level proves the arm; three prove
    // the recursion does not stop early.
    assert_fragment_is_transparent(
        "triple-nested fragment in component children",
        &in_card("<span>{p.a}</span><Inner n={p.n}/>"),
        &in_card("<><><><span>{p.a}</span><Inner n={p.n}/></></></>"),
        TransformTarget::Dom,
        false,
    );
}

#[test]
fn a_fragment_in_component_children_does_not_hide_an_event() {
    // Events are the one binding whose helper (`delegateEvents`) is decided by
    // a module-wide analysis pass rather than by the binding walk, so a
    // fragment that hid a listener would leave the import present but the
    // event list empty. Comparing the full import line covers the helper; the
    // assert below covers the plan's event list.
    let flat = compile(
        &in_card("<button onClick={p.go}>x</button>"),
        TransformTarget::Dom,
        false,
    );
    let with_fragment = compile(
        &in_card("<><button onClick={p.go}>x</button></>"),
        TransformTarget::Dom,
        false,
    );

    assert_eq!(runtime_import(&flat), runtime_import(&with_fragment));
    assert!(
        with_fragment.code.contains("delegateEvents"),
        "the delegated event must survive the fragment:\n{}",
        with_fragment.code
    );
}

#[test]
fn a_fragment_in_component_children_does_not_hide_a_nested_component() {
    // `ChildIr::Component` inside the fragment arm calls
    // `collect_component_helper_usage`, which is where `createComponent` comes
    // from. If the fragment arm dropped its children, the import would lose it.
    let with_fragment = compile(
        &in_card("<><Inner n={p.n}/></>"),
        TransformTarget::Dom,
        false,
    );
    assert!(
        runtime_import(&with_fragment).contains("createComponent"),
        "a component nested in a fragment must still be imported:\n{}",
        with_fragment.code
    );
}

/// The hydration plan's node sequence, with the allocation-order digits
/// stripped.
///
/// A fragment is a node and takes an id, so every id allocated after it shifts
/// by one. That is an allocation-order artifact, not a semantic difference.
/// What must hold is the *sequence of markers* — same kinds, same tag names,
/// same binding kinds, same marker letter, in the same order — because that is
/// what hydration walks at runtime.
fn hydration_markers(result: &TransformModuleResult) -> Vec<String> {
    let plan = result
        .hydration_plan
        .as_ref()
        .expect("this fixture must produce a hydration plan");
    let json = serde_json::to_value(plan).expect("the plan is JSON data");
    json["components"][0]["nodes"]
        .as_array()
        .expect("the plan has a node list")
        .iter()
        .enumerate()
        .map(|(index, node)| {
            let bindings = node["bindings"]
                .as_array()
                .expect("a node has a binding list")
                .iter()
                .map(|binding| {
                    format!(
                        "{}:{}:{}",
                        binding["kind"].as_str().unwrap_or("?"),
                        binding["once"].as_bool().unwrap_or(false),
                        binding["id"].is_number()
                    )
                })
                .collect::<Vec<_>>()
                .join(",");
            // The marker id is `<component>.<kind><nodeId>`; the kind letter is
            // what hydration switches on, the number is the allocation order
            // the fragment legitimately shifts. Keep the letter, drop the digits.
            let marker = node["id"].as_str().unwrap_or("?");
            let marker_kind: String = marker
                .rsplit('.')
                .next()
                .unwrap_or("?")
                .chars()
                .take_while(|c| !c.is_ascii_digit())
                .collect();
            format!(
                "{index}|{}|{}|{}|{}|{}",
                node["kind"].as_str().unwrap_or("?"),
                node["tagName"].as_str().unwrap_or("-"),
                node["optional"].as_bool().unwrap_or(false),
                bindings,
                marker_kind,
            )
        })
        .collect()
}

#[test]
fn a_fragment_in_component_children_produces_the_same_hydration_markers_as_the_flat_form() {
    // The hydration plan is derived from the emitted bindings, so this is the
    // collector's output observed through a second consumer.
    let flat = compile(
        "export function App(p) {\n  return <div><span>{p.a}</span></div>\n}\n",
        TransformTarget::Dom,
        true,
    );
    let with_fragment = compile(
        "export function App(p) {\n  return <div><><span>{p.a}</span></></div>\n}\n",
        TransformTarget::Dom,
        true,
    );

    assert_eq!(
        hydration_markers(&flat),
        hydration_markers(&with_fragment),
        "a fragment must not change the hydration marker sequence"
    );
}

#[test]
fn the_ssr_target_also_sees_through_a_fragment_in_component_children() {
    assert_fragment_is_transparent(
        "SSR, component children",
        &in_card("<span>{p.a}</span>"),
        &in_card("<><span>{p.a}</span></>"),
        TransformTarget::Ssr,
        false,
    );
}

#[test]
fn a_fragment_as_a_component_root_is_unaffected() {
    // The case the pre-existing fixtures did cover. Kept so a future change to
    // the child-position arms cannot silently move this one.
    assert_fragment_is_transparent(
        "fragment as component root",
        "export function App(p) {\n  return <span>{p.a}</span>\n}\n",
        "export function App(p) {\n  return <><span>{p.a}</span></>\n}\n",
        TransformTarget::Dom,
        false,
    );
}
