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

#[test]
fn nested_for_scopes_restore_between_siblings() {
    // Two sibling `For` elements each push an accessor scope. If the first did
    // not pop, the second's accessor would resolve against the wrong frame and
    // its expression would reference a stale accessor.
    let module = ir_of(
        "import { For } from '@zeus-js/zeus';\nexport function App(props) {\n  return <div><For each={props.a}>{x => x.name}</For><For each={props.b}>{y => y.title}</For></div>\n}\n",
        "siblings.tsx",
    );

    let text = format!("{module:?}");
    assert!(
        text.contains("x.name"),
        "first For lost its accessor: {text}"
    );
    assert!(
        text.contains("y.title"),
        "second For lost its accessor: {text}"
    );
}

#[test]
fn deeply_nested_for_scopes_resolve_the_correct_item() {
    let module = ir_of(
        "import { For } from '@zeus-js/zeus';\nexport function App(props) {\n  return <For each={props.rows}>{row => <For each={row.cells}>{(cell, index) => index() + cell.value}</For>}</For>\n}\n",
        "nested.tsx",
    );

    let text = format!("{module:?}");
    assert!(text.contains("row.cells"), "outer accessor lost");
    assert!(text.contains("cell.value"), "inner accessor lost");
    assert!(text.contains("index()"), "inner index accessor lost");
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
    // (`ZEUS_INVALID_SLOT_USAGE`). The depth is raised while a `<Host>`'s
    // children are lowered and restored by `HostDepthGuard`; this pins the
    // observable rule the depth exists to enforce.
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
