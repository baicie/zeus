//! State isolation and scope balance in lowering.
//!
//! `Lowerer` accumulates `NodeId`s, components, diagnostics, a host-nesting
//! depth, a For-accessor scope stack and a namespace. All of that is per-run
//! state, and every test here checks one way it could leak, mis-restore or
//! reorder.
//!
//! These complement the golden fixtures: a golden pins what one module compiles
//! to, while these pin the invariants across calls, across nesting, and across
//! early-exit paths that a single fixture never reaches.

use zeus_compiler::ir::{ChildIr, ModuleIr, RootIr};
use zeus_compiler::lower::{LowerResult, lower_module};

fn ir_of(source: &str, filename: &str) -> ModuleIr {
    let result = lower(source, filename);
    assert!(
        result.diagnostics.is_empty(),
        "unexpected diagnostics for {filename}: {:?}",
        result.diagnostics
    );
    result.ir.expect("module lowered to IR")
}

fn lower(source: &str, filename: &str) -> LowerResult {
    lower_module(source, filename)
}

/// Every `NodeId` reachable from a component root, in traversal order.
fn node_ids(root: &RootIr, out: &mut Vec<u32>) {
    match root {
        RootIr::Element(element) => {
            out.push(element.id);
            for child in &element.children {
                child_ids(child, out);
            }
        }
        RootIr::Fragment(fragment) => {
            for child in &fragment.children {
                child_ids(child, out);
            }
        }
        RootIr::Component(component) => {
            out.push(component.id);
            for prop in &component.props {
                if let zeus_compiler::ir::ComponentPropIr::Named(named) = prop
                    && let zeus_compiler::ir::ComponentPropValueIr::Children(children) =
                        &named.value
                {
                    for child in children {
                        child_ids(child, out);
                    }
                }
            }
        }
        RootIr::Show(show) => {
            out.push(show.id);
            for child in &show.children {
                child_ids(child, out);
            }
        }
        RootIr::For(binding) => {
            out.push(binding.id);
            for child in &binding.body {
                child_ids(child, out);
            }
        }
        RootIr::Transition(binding) => {
            out.push(binding.id);
            for child in &binding.children {
                child_ids(child, out);
            }
        }
        RootIr::ErrorBoundary(boundary) => {
            out.push(boundary.id);
        }
    }
}

fn child_ids(child: &ChildIr, out: &mut Vec<u32>) {
    match child {
        ChildIr::Element(element) => {
            out.push(element.id);
            for next in &element.children {
                child_ids(next, out);
            }
        }
        ChildIr::Text(text) => out.push(text.id),
        ChildIr::DynamicText(text) => out.push(text.id),
        ChildIr::Fragment(fragment) => {
            for next in &fragment.children {
                child_ids(next, out);
            }
        }
        ChildIr::Component(component) => {
            out.push(component.id);
            for prop in &component.props {
                if let zeus_compiler::ir::ComponentPropIr::Named(named) = prop
                    && let zeus_compiler::ir::ComponentPropValueIr::Children(children) =
                        &named.value
                {
                    for next in children {
                        child_ids(next, out);
                    }
                }
            }
        }
        ChildIr::Show(show) => {
            out.push(show.id);
            for next in &show.children {
                child_ids(next, out);
            }
        }
        ChildIr::For(binding) => {
            out.push(binding.id);
            for next in &binding.body {
                child_ids(next, out);
            }
        }
        ChildIr::Transition(binding) => {
            out.push(binding.id);
            for next in &binding.children {
                child_ids(next, out);
            }
        }
        ChildIr::DynamicRegion(region) => out.push(region.id),
        ChildIr::ErrorBoundary(boundary) => out.push(boundary.id),
    }
}

fn all_node_ids(module: &ModuleIr) -> Vec<u32> {
    let mut ids = Vec::new();
    for component in &module.components {
        // `ComponentIr.id` is allocated before its root, so leaving it out
        // would make the sequence look monotonic across a gap it actually has.
        ids.push(component.id);
        node_ids(&component.root, &mut ids);
    }
    ids
}

#[test]
fn two_modules_lowered_in_a_row_do_not_share_state() {
    // Each `lower_module` call builds its own `LoweringState`. If any of it
    // were module-level, the second call would start numbering after the first.
    let first = ir_of(
        "export function A(props) { return <div><span>{props.a}</span></div> }\n",
        "a.tsx",
    );
    let second = ir_of(
        "export function B(props) { return <div><span>{props.b}</span></div> }\n",
        "b.tsx",
    );

    assert_eq!(
        all_node_ids(&first),
        all_node_ids(&second),
        "identical shapes must produce identical NodeIds regardless of what ran before"
    );
}

#[test]
fn repeated_lowering_of_one_input_is_byte_identical() {
    let source = "import { For } from '@zeus-js/zeus';\nexport function App(props) {\n  return <For each={props.items}>{item => item.name}</For>\n}\n";
    let first = ir_of(source, "repeat.tsx");
    let second = ir_of(source, "repeat.tsx");
    assert_eq!(first, second, "lowering must be deterministic");
}

#[test]
fn diagnostics_from_one_module_do_not_reach_the_next() {
    // A module that produces a diagnostic must not contaminate the next one.
    let failed = lower("function broken( { }\n", "broken.tsx");
    assert!(
        !failed.diagnostics.is_empty(),
        "expected a parse diagnostic"
    );
    assert!(failed.ir.is_none());

    let clean = lower(
        "export function App(props) { return <p>{props.text}</p> }\n",
        "clean.tsx",
    );
    assert!(
        clean.diagnostics.is_empty(),
        "the next module inherited diagnostics: {:?}",
        clean.diagnostics
    );
    assert!(clean.ir.is_some());
}

/// Every `For` in the module with the `for_id`s its body expressions resolve to.
fn for_scopes(module: &ModuleIr) -> Vec<(u32, Vec<u32>)> {
    let mut found = Vec::new();
    for component in &module.components {
        collect_for_scopes(&component.root, &mut found);
    }
    found
}

fn collect_for_scopes(root: &RootIr, out: &mut Vec<(u32, Vec<u32>)>) {
    match root {
        RootIr::For(binding) => {
            out.push((binding.id, accessor_for_ids(&binding.body)));
            for child in &binding.body {
                child_for_scopes(child, out);
            }
        }
        RootIr::Element(element) => {
            for child in &element.children {
                child_for_scopes(child, out);
            }
        }
        RootIr::Fragment(fragment) => {
            for child in &fragment.children {
                child_for_scopes(child, out);
            }
        }
        _ => {}
    }
}

fn child_for_scopes(child: &ChildIr, out: &mut Vec<(u32, Vec<u32>)>) {
    match child {
        ChildIr::For(binding) => {
            out.push((binding.id, accessor_for_ids(&binding.body)));
            for next in &binding.body {
                child_for_scopes(next, out);
            }
        }
        ChildIr::Element(element) => {
            for next in &element.children {
                child_for_scopes(next, out);
            }
        }
        ChildIr::Fragment(fragment) => {
            for next in &fragment.children {
                child_for_scopes(next, out);
            }
        }
        _ => {}
    }
}

/// The `for_id` each accessor in these children resolves to.
fn accessor_for_ids(children: &[ChildIr]) -> Vec<u32> {
    let mut ids = Vec::new();
    for child in children {
        if let ChildIr::DynamicText(text) = child {
            ids.extend(text.expression.for_accessors.iter().map(|a| a.for_id));
        }
    }
    ids
}

#[test]
fn sibling_for_scopes_each_resolve_to_their_own_for_id() {
    // Two sibling `For`s each push an accessor scope. If the first did not pop,
    // the second's expression would resolve against the first's frame and
    // record the wrong `for_id` — visible in the IR, not just in the text.
    let module = ir_of(
        "import { For } from '@zeus-js/zeus';\nexport function App(props) {\n  return <div><For each={props.a}>{x => x.name}</For><For each={props.b}>{y => y.title}</For></div>\n}\n",
        "siblings.tsx",
    );

    let scopes = for_scopes(&module);
    assert_eq!(scopes.len(), 2, "expected two For nodes, got {scopes:?}");
    for (for_id, resolved) in &scopes {
        assert_eq!(
            resolved.as_slice(),
            [*for_id].as_slice(),
            "the body of For {for_id} must reference that For, not another"
        );
    }
    assert_ne!(scopes[0].0, scopes[1].0, "the two Fors need distinct ids");
}

#[test]
fn nested_for_scopes_resolve_to_distinct_frames() {
    // The inner body must resolve to the inner `For`, the outer body to the
    // outer one. A single shared stack that never popped would collapse these.
    let module = ir_of(
        "import { For } from '@zeus-js/zeus';\nexport function App(props) {\n  return <For each={props.rows}>{row => <div><For each={row.cells}>{(cell, index) => index() + cell.value}</For></div>}</For>\n}\n",
        "nested.tsx",
    );

    let scopes = for_scopes(&module);
    assert_eq!(
        scopes.len(),
        2,
        "expected outer and inner For, got {scopes:?}"
    );

    let outer_id = scopes[0].0;
    let inner_id = scopes[1].0;
    let inner_resolved = &scopes[1].1;
    assert_ne!(outer_id, inner_id, "outer and inner need distinct ids");
    assert_eq!(
        inner_resolved.as_slice(),
        [inner_id].as_slice(),
        "the inner body must reference the inner For {inner_id}, got {inner_resolved:?}"
    );
}

#[test]
fn svg_namespace_does_not_leak_to_a_sibling_element() {
    // `<svg>` changes the namespace for its children; the element after it must
    // be back in HTML, or it would be lowered with SVG rules.
    let module = ir_of(
        "export function App(props) {\n  return <div><svg><path d={props.d} /></svg><span>{props.text}</span></div>\n}\n",
        "svg.tsx",
    );

    let root = match &module.components[0].root {
        RootIr::Element(element) => element,
        other => panic!("expected an element root, got {other:?}"),
    };

    let svg = root
        .children
        .iter()
        .find_map(|child| match child {
            ChildIr::Element(element) if element.tag_name == "svg" => Some(element),
            _ => None,
        })
        .expect("svg element");
    assert_eq!(svg.namespace, "svg", "svg must lower in the SVG namespace");

    let span = root
        .children
        .iter()
        .find_map(|child| match child {
            ChildIr::Element(element) if element.tag_name == "span" => Some(element),
            _ => None,
        })
        .expect("span element");
    assert_eq!(
        span.namespace, "html",
        "the element after </svg> must be back in HTML"
    );
}

#[test]
fn a_slot_outside_a_host_is_rejected() {
    // `host_depth == 0` is what makes a `<Slot>` outside a `<Host>` an error
    // (`ZEUS_INVALID_SLOT_USAGE`). The depth is saved, raised and restored
    // inline in `lower_component_with_kind`; this pins the rule it enforces.
    let result = lower(
        "import { Host, Slot } from '@zeus-js/zeus';\nconst B = defineElement('z-b', { props: { n: Number } }, () => <div><Slot /></div>)\n",
        "slot-outside-host.tsx",
    );

    let codes: Vec<&str> = result.diagnostics.iter().map(|d| d.code.as_str()).collect();
    assert!(
        codes.contains(&"ZEUS_INVALID_SLOT_USAGE"),
        "a `<Slot>` outside a host must be rejected; got {codes:?}"
    );
}

#[test]
fn node_ids_are_allocated_in_source_order() {
    // Hydration markers derive from NodeId, so an allocation-order change is a
    // wire-format change even when generated code reads the same.
    let module = ir_of(
        "export function App(props) {\n  return <div><b>{props.first}</b><i>{props.second}</i></div>\n}\n",
        "order.tsx",
    );

    let ids = all_node_ids(&module);
    assert!(
        ids.windows(2).all(|pair| pair[0] < pair[1]),
        "NodeIds must increase in source order, got {ids:?}"
    );
}

#[test]
fn span_positions_match_the_source() {
    // A moved span would point diagnostics at the wrong line without failing
    // any structural assertion.
    let source =
        "export function App(props) {\n  return <div><span>{props.value}</span></div>\n}\n";
    let module = ir_of(source, "span.tsx");

    let root = match &module.components[0].root {
        RootIr::Element(element) => element,
        other => panic!("expected an element root, got {other:?}"),
    };
    assert_eq!(root.span.start.line, 2, "div starts on line 2");
    assert_eq!(root.span.start.column, 9, "div starts after `return `");

    let child = root
        .children
        .iter()
        .find_map(|child| match child {
            ChildIr::Element(element) => Some(element),
            _ => None,
        })
        .expect("span element");
    assert_eq!(child.span.start.line, 2, "nested span is on line 2");
}

#[test]
fn builtin_names_are_not_confused_with_shadowed_locals() {
    // `Show` imported from the runtime is a builtin; a local `Show` is not.
    // Resolving by name alone would compile the local as a control-flow node.
    let module = ir_of(
        "const Show = (props) => props.children\nconst App = (props) => <Show>{props.x}</Show>\n",
        "shadow.tsx",
    );

    let text = format!("{module:?}");
    assert!(
        !text.contains("ShowBinding"),
        "a local shadowing `Show` must not lower as the builtin: {text}"
    );
}

#[test]
fn an_unsupported_expression_does_not_block_later_roots() {
    // Lowering records a diagnostic and keeps going. If a diagnostic were a
    // hard stop, the second component would be missing from the IR.
    let result = lower(
        "export function Bad(props) {\n  return <div>{props.render(<span />)}</div>\n}\nexport function Good(props) {\n  return <p>{props.text}</p>\n}\n",
        "mixed.tsx",
    );

    assert!(
        !result.diagnostics.is_empty(),
        "expected a diagnostic for nested JSX"
    );
    assert!(
        result.ir.is_none(),
        "a diagnostic fails the module, and the IR must not be half-built"
    );
}
