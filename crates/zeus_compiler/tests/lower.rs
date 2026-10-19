use std::thread;

use zeus_compiler::{
    ir::{
        AttributeIr, ChildIr, ComponentPropIr, ComponentPropValueIr, DynamicRegionExpressionIr,
        ExpressionForm, RootIr, StaticAttributeValue,
    },
    lower::lower_module,
};

fn root_element(root: &zeus_compiler::ir::RootIr) -> &zeus_compiler::ir::ElementIr {
    match root {
        zeus_compiler::ir::RootIr::Element(element) => element,
        zeus_compiler::ir::RootIr::Fragment(_)
        | zeus_compiler::ir::RootIr::Component(_)
        | zeus_compiler::ir::RootIr::Show(_)
        | zeus_compiler::ir::RootIr::For(_)
        | zeus_compiler::ir::RootIr::ErrorBoundary(_)
        | zeus_compiler::ir::RootIr::Transition(_) => panic!("expected element root"),
    }
}

const FIXTURE: &str = r#"export const App = (props: { name: string }) => (
  <div class="greeting">Hello {props.name}</div>
)
"#;

#[test]
fn lowers_native_element_to_owned_deterministic_ir() {
    let first = lower_module(FIXTURE, "App.tsx");
    let second = lower_module(FIXTURE, "App.tsx");

    assert!(first.diagnostics.is_empty());
    assert_eq!(first, second);

    let module = first.ir.expect("valid TSX produces IR");
    assert_eq!(module.id, 0);
    assert_eq!(module.components.len(), 1);

    let component = &module.components[0];
    let root = root_element(&component.root);
    assert_eq!(component.id, 1);
    assert_eq!(root.id, 2);
    assert_eq!(root.reference.node_id, 2);
    assert_eq!(root.tag_name, "div");

    let AttributeIr::Static(class) = &root.attributes[0] else {
        panic!("class must be lowered as a static attribute");
    };
    assert_eq!(class.id, 3);
    assert_eq!(class.name, "class");
    assert_eq!(class.value, StaticAttributeValue::String("greeting".into()));

    let ChildIr::Text(text) = &root.children[0] else {
        panic!("first child must be static text");
    };
    assert_eq!(text.id, 4);
    assert_eq!(text.value, "Hello ");

    let ChildIr::DynamicText(dynamic) = &root.children[1] else {
        panic!("second child must be dynamic text");
    };
    assert_eq!(dynamic.id, 5);
    assert_eq!(dynamic.reference.node_id, 5);
    assert_eq!(dynamic.expression.code, "props.name");
}

#[test]
fn lowers_once_intrinsics_only_on_supported_dom_bindings() {
    let source = r"export const App = props => (
  <div
    title={once(props.title)}
    class={once(props.className)}
    style={once(props.style)}
    prop:value={once(props.value)}
    data-literal={'@once'}
    data-comment={props.note}
    data-near={/* @once-ish */ props.near}
  >
    {once(props.label)}
    {props.detail}
  </div>
)";
    let lowered = lower_module(source, "once.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("once bindings produce IR");
    let root = root_element(&module.components[0].root);

    for index in 0..3 {
        let AttributeIr::Dynamic(attribute) = &root.attributes[index] else {
            panic!("attribute {index} must be dynamic");
        };
        assert!(attribute.once);
    }

    let AttributeIr::Property(property) = &root.attributes[3] else {
        panic!("prop:value must be a property binding");
    };
    assert!(property.once);

    for index in 4..7 {
        let AttributeIr::Dynamic(attribute) = &root.attributes[index] else {
            panic!("attribute {index} must be dynamic");
        };
        assert!(!attribute.once);
    }

    let ChildIr::DynamicText(label) = &root.children[0] else {
        panic!("marked child must be dynamic text");
    };
    assert!(label.once);
    let ChildIr::DynamicText(detail) = &root.children[1] else {
        panic!("unmarked child must be dynamic text");
    };
    assert!(!detail.once);
}

#[test]
fn treats_shadowed_once_as_a_regular_function_call() {
    let lowered = lower_module(
        "const once = value => value; export const App = props => <div>{once(props.label)}</div>",
        "shadowed-once.tsx",
    );
    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("shadowed call lowers");
    let root = root_element(&module.components[0].root);
    let ChildIr::DynamicRegion(region) = &root.children[0] else {
        panic!("shadowed once call must retain ordinary call semantics");
    };
    let DynamicRegionExpressionIr::Value { expression } = &region.expression else {
        panic!("shadowed call should remain a regular value expression");
    };
    assert_eq!(expression.code, "once(props.label)");
}

#[test]
fn rejects_invalid_once_intrinsic_shapes_and_non_dom_targets() {
    for (source, expected) in [
        (
            "export const App = props => <div>{once()}</div>",
            "ZEUS_INVALID_ONCE_INTRINSIC",
        ),
        (
            "export const App = props => <div>{once(props.a, props.b)}</div>",
            "ZEUS_INVALID_ONCE_INTRINSIC",
        ),
        (
            "export const App = props => <div>{once(...props.values)}</div>",
            "ZEUS_INVALID_ONCE_INTRINSIC",
        ),
        (
            "export const App = props => <div>{once(props.render())}</div>",
            "ZEUS_INVALID_ONCE_TARGET",
        ),
        (
            "export const App = props => <button title={once()} />",
            "ZEUS_INVALID_ONCE_INTRINSIC",
        ),
        (
            "export const App = props => <button onClick={once(props.click)} />",
            "ZEUS_INVALID_ONCE_TARGET",
        ),
        (
            "export const App = props => <Widget value={once(props.value)} />",
            "ZEUS_INVALID_ONCE_TARGET",
        ),
    ] {
        let lowered = lower_module(source, "invalid-once-intrinsic.tsx");
        assert!(lowered.ir.is_none(), "unexpected IR: {:?}", lowered.ir);
        assert_eq!(lowered.diagnostics.len(), 1, "{:?}", lowered.diagnostics);
        assert_eq!(lowered.diagnostics[0].code, expected);
    }
}

#[test]
fn lowers_once_intrinsics_after_all_ecmascript_line_terminators() {
    for (name, terminator) in [
        ("lf", "\n"),
        ("cr", "\r"),
        ("line-separator", "\u{2028}"),
        ("paragraph-separator", "\u{2029}"),
    ] {
        let source = format!(
            "export const App = props => <div>{{// note{terminator}once(props.label)}}</div>"
        );
        let filename = format!("once-{name}.tsx");
        let lowered = lower_module(&source, &filename);

        assert!(
            lowered.diagnostics.is_empty(),
            "{name}: {:?}",
            lowered.diagnostics
        );
        let module = lowered.ir.expect("line terminator fixture lowers");
        let root = root_element(&module.components[0].root);
        let ChildIr::DynamicText(label) = &root.children[0] else {
            panic!("{name}: marked child must be dynamic text");
        };
        assert!(label.once, "{name}: once intrinsic must be preserved");
    }
}

#[test]
fn rejects_once_markers_on_non_binding_targets() {
    for (source, filename) in [
        (
            "export const App = props => <button onClick={/* @once */ props.onClick} />",
            "once-event.tsx",
        ),
        (
            "export const App = inputRef => <input ref={/* @once */ inputRef} />",
            "once-ref.tsx",
        ),
        (
            "export const App = props => <Widget title={/* @once */ props.title} />",
            "once-component.tsx",
        ),
        (
            "export const App = props => <Widget>{/* @once */ props.label}</Widget>",
            "once-component-child.tsx",
        ),
        (
            "export const App = props => <div>{/* @once */ props.children}</div>",
            "once-node-binding.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items}>{item => <div>{/* @once */ item.children}</div>}</For>",
            "once-for-node-binding.tsx",
        ),
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={/* @once */ props.visible}>yes</Show>",
            "once-show.tsx",
        ),
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.visible}>{/* @once */ props.label}</Show>",
            "once-show-child.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={/* @once */ props.items}>{item => item}</For>",
            "once-for.tsx",
        ),
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.visible} fallback={/* @once */ props.fallback}>yes</Show>",
            "once-show-fallback.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items} by={/* @once */ (item => item.id)}>{item => item}</For>",
            "once-for-key.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items}>{/* @once */ item => <span>{item}</span>}</For>",
            "once-for-callback.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items}>{/* @once */ props.child}</For>",
            "once-invalid-for-child.tsx",
        ),
        (
            "import { defineElement, Host } from '@zeus-js/runtime-dom'; export const El = defineElement('z-once', {}, props => <Host class={/* @once */ props.className} />)",
            "once-host.tsx",
        ),
        (
            "import { defineElement, Host } from '@zeus-js/runtime-dom'; export const El = defineElement('z-once', {}, props => <Host>{/* @once */ props.label}</Host>)",
            "once-host-child.tsx",
        ),
        (
            "import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'; export const El = defineElement('z-once', {}, props => <Host><Slot name={/* @once */ props.name} /></Host>)",
            "once-slot.tsx",
        ),
        (
            "import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'; export const El = defineElement('z-once', {}, props => <Host><Slot>{/* @once */ props.fallback}</Slot></Host>)",
            "once-slot-child.tsx",
        ),
    ] {
        let lowered = lower_module(source, filename);

        assert!(lowered.ir.is_none(), "{filename} must fail lowering");
        assert_eq!(lowered.diagnostics.len(), 1, "{filename}");
        assert_eq!(lowered.diagnostics[0].code, "ZEUS_INVALID_ONCE_TARGET");
        assert!(lowered.diagnostics[0].span.is_some());
        assert!(
            lowered.diagnostics[0]
                .message
                .contains("no longer accepted")
        );
        assert!(
            lowered.diagnostics[0]
                .hint
                .as_deref()
                .is_some_and(|hint| hint.contains("once(value)"))
        );
    }
}

#[test]
fn rejects_once_markers_on_every_builtin_attribute_form() {
    for (source, filename) in [
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.visible} extra={/* @once */ props.extra}>yes</Show>",
            "once-show-unknown-attribute.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items} extra={/* @once */ props.extra}>{item => item}</For>",
            "once-for-unknown-attribute.tsx",
        ),
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.visible} when={/* @once */ props.other}>yes</Show>",
            "once-show-duplicate-attribute.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items} each={/* @once */ props.other}>{item => item}</For>",
            "once-for-duplicate-attribute.tsx",
        ),
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.visible} {.../* @once */ props.extra}>yes</Show>",
            "once-show-spread-attribute.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items} {.../* @once */ props.extra}>{item => item}</For>",
            "once-for-spread-attribute.tsx",
        ),
    ] {
        let lowered = lower_module(source, filename);

        assert!(lowered.ir.is_none(), "{filename} must fail lowering");
        assert_eq!(lowered.diagnostics.len(), 1, "{filename}");
        assert_eq!(lowered.diagnostics[0].code, "ZEUS_INVALID_ONCE_TARGET");
        assert!(lowered.diagnostics[0].span.is_some());
    }
}

#[test]
fn rejects_once_intrinsics_on_ignored_builtin_attributes() {
    for (source, filename) in [
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.visible} extra={once(props.extra)}>yes</Show>",
            "once-show-unknown-attribute.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items} {...once(props.extra)}>{item => item}</For>",
            "once-for-spread-attribute.tsx",
        ),
    ] {
        let lowered = lower_module(source, filename);

        assert!(lowered.ir.is_none(), "{filename} must fail lowering");
        assert_eq!(lowered.diagnostics.len(), 1, "{filename}");
        assert_eq!(lowered.diagnostics[0].code, "ZEUS_INVALID_ONCE_TARGET");
    }
}

#[test]
fn permits_once_on_namespaced_properties_even_when_names_resemble_events_or_refs() {
    let source = r"export const App = props => <div
  prop:onClick={once(props.callback)}
  prop:ref={once(props.reference)}
/>";
    let lowered = lower_module(source, "once-property-names.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("property bindings lower");
    let root = root_element(&module.components[0].root);
    for attribute in &root.attributes {
        let AttributeIr::Property(property) = attribute else {
            panic!("namespaced binding must remain a property");
        };
        assert!(property.once);
    }
}

#[test]
fn rejects_mixed_once_and_reactive_raw_text_bindings() {
    let lowered = lower_module(
        "export const App = props => <style>{once(props.prefix)}{props.suffix}</style>",
        "once-raw-text.tsx",
    );

    assert!(lowered.ir.is_none());
    assert_eq!(lowered.diagnostics.len(), 1);
    assert_eq!(
        lowered.diagnostics[0].code,
        "ZEUS_MIXED_RAW_TEXT_BINDING_MODE"
    );
}

#[test]
fn lowers_root_and_nested_fragments_without_extra_components() {
    let source = r"export const App = props => <><span>{props.first}</span><><b>{props.second}</b>tail</></>";
    let lowered = lower_module(source, "fragment.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("fragment produces IR");
    assert_eq!(module.components.len(), 1);
    let RootIr::Fragment(root) = &module.components[0].root else {
        panic!("root JSX fragment must lower to Fragment IR");
    };
    assert_eq!(root.kind, "Fragment");
    assert!(matches!(root.children[0], ChildIr::Element(_)));
    let ChildIr::Fragment(nested) = &root.children[1] else {
        panic!("nested JSX fragment must remain a child fragment");
    };
    assert_eq!(nested.children.len(), 2);
    assert!(matches!(nested.children[0], ChildIr::Element(_)));
    assert!(matches!(nested.children[1], ChildIr::Text(_)));
}

#[test]
fn lowering_is_deterministic_across_threads() {
    let expected = lower_module(FIXTURE, "App.tsx");
    let handles = (0..4)
        .map(|_| thread::spawn(|| lower_module(FIXTURE, "App.tsx")))
        .collect::<Vec<_>>();

    for handle in handles {
        assert_eq!(handle.join().expect("lowering thread succeeds"), expected);
    }
}

#[test]
fn reports_utf8_offsets_and_utf16_columns_across_crlf() {
    let source = "// prefix\r\n/* 😀中 */ export const App = (props: { name: string }) => <div>{props.name}</div>";
    let lowered = lower_module(source, "unicode.tsx");

    assert!(lowered.diagnostics.is_empty());
    let module = lowered.ir.expect("valid TSX produces IR");
    let root = root_element(&module.components[0].root);
    let ChildIr::DynamicText(dynamic) = &root.children[0] else {
        panic!("child must be dynamic text");
    };

    let byte_offset = u32::try_from(source.find("props.name}").unwrap()).unwrap();
    assert_eq!(dynamic.expression.span.start.offset, byte_offset);
    assert_eq!(dynamic.expression.span.start.line, 2);
    assert_eq!(dynamic.expression.span.start.column, 64);
}

#[test]
fn returns_structured_parser_diagnostics() {
    let lowered = lower_module("export const App = () => <div>", "broken.tsx");

    assert!(lowered.ir.is_none());
    assert!(!lowered.diagnostics.is_empty());
    assert_eq!(lowered.diagnostics[0].code, "ZEUS_PARSE_ERROR");
    assert_eq!(lowered.diagnostics[0].filename, "broken.tsx");
    assert!(lowered.diagnostics[0].span.is_some());
}

#[test]
fn lowers_spread_attributes_with_owned_source_spans() {
    let source = "export const App = props => <div {...props} />";
    let lowered = lower_module(source, "spread.tsx");
    assert!(lowered.diagnostics.is_empty());
    let module = lowered.ir.unwrap();
    let AttributeIr::Spread(spread) = &root_element(&module.components[0].root).attributes[0]
    else {
        panic!("spread IR required");
    };
    assert_eq!(spread.target, "native");
    assert_eq!(spread.expression.code, "props");
    assert!(spread.span.end.offset > spread.span.start.offset);
}

#[test]
fn lowers_component_elements_with_lazy_props_and_children() {
    let source = "export const App = props => <Widget title={props.title} enabled><span>{props.name}</span></Widget>";
    let lowered = lower_module(source, "component.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("component produces IR");
    let zeus_compiler::ir::RootIr::Component(component) = &module.components[0].root else {
        panic!("component root must lower to ComponentBindingIr");
    };
    assert_eq!(component.callee.code, "Widget");
    assert_eq!(component.props.len(), 3);
    assert_eq!(component.props[0].named().unwrap().name, "title");
    assert_eq!(component.props[1].named().unwrap().name, "enabled");
    assert_eq!(component.props[2].named().unwrap().name, "children");
}

#[test]
fn lowers_imported_show_and_for_as_control_flow_bindings() {
    let source = r#"import { Show, For } from '@zeus-js/zeus'
export const App = props => <div><Show when={props.visible} fallback="hidden"><span>{props.name}</span></Show><For each={props.items}>{item => <b>{item}</b>}</For></div>
"#;
    let lowered = lower_module(source, "control-flow.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("control flow produces IR");
    let root = root_element(&module.components[0].root);
    assert!(matches!(root.children[0], ChildIr::Show(_)));
    let ChildIr::For(for_binding) = &root.children[1] else {
        panic!("For must lower to a For binding");
    };
    assert_eq!(for_binding.item, "item");
    assert!(matches!(for_binding.body.as_slice(), [ChildIr::Element(_)]));
}

#[test]
fn lowers_parenthesized_for_callbacks() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <ul><For each={props.items}>{item => (
  <li>{item.name}</li>
)}</For></ul>
";
    let lowered = lower_module(source, "for-parenthesized.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("parenthesized For callback produces IR");
    let root = root_element(&module.components[0].root);
    let ChildIr::For(for_binding) = &root.children[0] else {
        panic!("For must lower to a binding");
    };
    assert_eq!(for_binding.item, "item");
    assert!(matches!(for_binding.body.as_slice(), [ChildIr::Element(_)]));
}

#[test]
fn lowers_for_accessor_dependencies_from_semantic_symbols() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <For each={props.items}>{(it\u0065m, ind\u0065x) => <b data-index={ind\u0065x}>{it\u0065m.label}</b>}</For>
";
    let lowered = lower_module(source, "for-accessor-symbols.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("For accessor symbols produce IR");
    let RootIr::For(for_binding) = &module.components[0].root else {
        panic!("For must lower to a root binding");
    };
    let [ChildIr::Element(element)] = for_binding.body.as_slice() else {
        panic!("For body must contain the returned element");
    };
    let AttributeIr::Dynamic(index_attribute) = &element.attributes[0] else {
        panic!("data-index must be dynamic");
    };
    assert_eq!(index_attribute.expression.for_accessors.len(), 1);
    assert_eq!(
        index_attribute.expression.for_accessors[0].for_id,
        for_binding.id
    );
    assert!(!index_attribute.expression.for_accessors[0].item);
    assert!(index_attribute.expression.for_accessors[0].index);

    let ChildIr::DynamicText(label) = &element.children[0] else {
        panic!("label must be dynamic text");
    };
    assert_eq!(label.expression.for_accessors.len(), 1);
    assert_eq!(label.expression.for_accessors[0].for_id, for_binding.id);
    assert!(label.expression.for_accessors[0].item);
    assert!(!label.expression.for_accessors[0].index);
}

#[test]
fn rejects_non_identifier_for_callback_parameters() {
    for (name, callback) in [
        ("object", "({ label }, index) => <b>{index}:{label}</b>"),
        ("array", "([label], index) => <b>{index}:{label}</b>"),
        (
            "default",
            "(item = props.fallback, index) => <b>{index}:{item.label}</b>",
        ),
        ("rest", "(...items) => <b>{items[0].label}</b>"),
        (
            "arity",
            "(item, index, extra) => <b>{item.label}:{index}:{extra}</b>",
        ),
    ] {
        let source = format!(
            "import {{ For }} from '@zeus-js/zeus'\nexport const App = props => <For each={{props.items}}>{{{callback}}}</For>\n"
        );
        let lowered = lower_module(&source, &format!("for-{name}-parameter.tsx"));

        assert_eq!(
            lowered
                .diagnostics
                .iter()
                .map(|diagnostic| diagnostic.code.as_str())
                .collect::<Vec<_>>(),
            ["ZEUS_UNSUPPORTED_FOR_CALLBACK_PARAMETER"],
            "{name}: {:?}",
            lowered.diagnostics
        );
        assert!(lowered.ir.is_none(), "{name}: invalid IR must not escape");
    }
}

#[test]
fn excludes_type_only_for_parameter_references_from_runtime_dependencies() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <For each={props.items}>{(item, index) => <span title={(props.value as typeof index)}>{item.label}</span>}</For>
";
    let lowered = lower_module(source, "for-type-only-reference.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("type-only reference produces IR");
    let RootIr::For(for_binding) = &module.components[0].root else {
        panic!("For must lower to a root binding");
    };
    let [ChildIr::Element(element)] = for_binding.body.as_slice() else {
        panic!("For body must contain the returned element");
    };
    let AttributeIr::Dynamic(title) = &element.attributes[0] else {
        panic!("title must be dynamic");
    };
    assert!(
        title.expression.for_accessors.is_empty(),
        "type-only index reference must not become a runtime dependency: {:?}",
        title.expression.for_accessors
    );
}

#[test]
fn validates_host_and_slot_builtin_boundaries() {
    let valid = r"import { defineElement as d, Host as H, Slot as S } from '@zeus-js/runtime-dom'
export const Element = d('z-card', { shadow: false }, props => <H><section><S /></section></H>)
";
    let lowered = lower_module(valid, "host.tsx");
    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);

    let invalid_host = r"import { Host } from '@zeus-js/runtime-dom'
export const App = () => <Host />
";
    let lowered = lower_module(invalid_host, "host-invalid.tsx");
    assert_eq!(
        lowered
            .diagnostics
            .first()
            .map(|diagnostic| diagnostic.code.as_str()),
        Some("ZEUS_INVALID_HOST_USAGE")
    );

    let invalid_slot = r"import { Slot } from '@zeus-js/runtime-dom'
export const App = () => <Slot />
";
    let lowered = lower_module(invalid_slot, "slot-invalid.tsx");
    assert_eq!(
        lowered
            .diagnostics
            .first()
            .map(|diagnostic| diagnostic.code.as_str()),
        Some("ZEUS_INVALID_SLOT_USAGE")
    );
}

#[test]
fn builtin_aliases_respect_lexical_shadowing() {
    let show_source = r"import { Show as If } from '@zeus-js/zeus'
export const App = (If, props) => <If when={props.visible}><span>content</span></If>
";
    let lowered = lower_module(show_source, "shadowed-show.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("shadowed Show name remains a component");
    let RootIr::Component(component) = &module.components[0].root else {
        panic!("a shadowing component must not lower as Show");
    };
    assert_eq!(component.kind, "Component");
    assert_eq!(component.callee.code, "If");
    assert!(
        component
            .props
            .iter()
            .any(|prop| { prop.named().is_some_and(|prop| prop.name == "when") })
    );

    let for_source = r"import { For as Each } from '@zeus-js/zeus'
export const App = Each => <Each each={items} />
";
    let lowered = lower_module(for_source, "shadowed-for.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("shadowed For name remains a component");
    let RootIr::Component(component) = &module.components[0].root else {
        panic!("a shadowing component must not lower as For");
    };
    assert_eq!(component.kind, "Component");
    assert_eq!(component.callee.code, "Each");
    assert!(
        component
            .props
            .iter()
            .any(|prop| { prop.named().is_some_and(|prop| prop.name == "each") })
    );
}

#[test]
fn resolves_named_define_element_setup_functions() {
    let source = r"import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

const setup = (props: { tone: string }) => (
  <Host class={props.tone}><section><Slot /></section></Host>
)

export const Element = defineElement('z-card', { shadow: false }, setup)
";
    let lowered = lower_module(source, "host-named-setup.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("named setup produces IR");
    let RootIr::Component(component) = &module.components[0].root else {
        panic!("Host must lower as a component boundary");
    };
    assert_eq!(component.kind, "Host");
    assert!(matches!(
        component
            .props
            .last()
            .and_then(|prop| prop.named())
            .map(|prop| &prop.value),
        Some(zeus_compiler::ir::ComponentPropValueIr::Children(_))
    ));
}

#[test]
fn lowers_conditional_and_logical_nested_jsx_regions() {
    let source = "export const App = props => <div>{props.ok ? <span>yes</span> : null}{props.ready && <b>ready</b>}</div>";
    let lowered = lower_module(source, "nested-expression.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("nested regions produce IR");
    let root = root_element(&module.components[0].root);
    assert!(matches!(root.children[0], ChildIr::DynamicRegion(_)));
    assert!(matches!(root.children[1], ChildIr::DynamicRegion(_)));
}

#[test]
fn lowers_array_map_nested_jsx_region() {
    let source =
        "export const App = props => <ul>{props.items.map(item => <li>{item.name}</li>)}</ul>";
    let lowered = lower_module(source, "nested-array.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("array region produces IR");
    let root = root_element(&module.components[0].root);
    let ChildIr::DynamicRegion(region) = &root.children[0] else {
        panic!("array map must lower to a dynamic region");
    };
    assert!(matches!(
        region.expression,
        zeus_compiler::ir::DynamicRegionExpressionIr::ArrayMap { .. }
    ));
}

#[test]
fn diagnoses_unsupported_nested_jsx_conditions_and_array_map_parameters() {
    for (name, source, expected_code) in [
        (
            "conditional-test",
            "export const App = () => <div>{(<i /> as any) ? <b /> : null}</div>",
            "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
        ),
        (
            "logical-left",
            "export const App = () => <div>{(<i /> as any) && <b />}</div>",
            "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
        ),
        (
            "array-map-source",
            "export const App = () => <div>{[<i />].map(item => <b />)}</div>",
            "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
        ),
        (
            "array-map-third-parameter",
            "export const App = props => <div>{props.items.map((item, index, array) => <b>{array.length}</b>)}</div>",
            "ZEUS_UNSUPPORTED_ARRAY_MAP_CALLBACK_PARAMETER",
        ),
        (
            "array-map-default-index",
            "export const App = props => <div>{props.items.map((item, index = 0) => <b>{index}</b>)}</div>",
            "ZEUS_UNSUPPORTED_ARRAY_MAP_CALLBACK_PARAMETER",
        ),
    ] {
        let lowered = lower_module(source, &format!("nested-jsx-{name}.tsx"));

        assert!(lowered.ir.is_none(), "{name}: invalid IR must not escape");
        assert_eq!(
            lowered.diagnostics.len(),
            1,
            "{name}: {:?}",
            lowered.diagnostics
        );
        assert_eq!(lowered.diagnostics[0].code, expected_code, "{name}");
        assert!(lowered.diagnostics[0].span.is_some(), "{name}");
    }
}

#[test]
fn lowers_direct_show_fallback_jsx_attributes() {
    let source = "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.ok} fallback=<i>off</i>><b>on</b></Show>";
    let lowered = lower_module(source, "show-direct-fallback.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("direct Show fallback produces IR");
    let RootIr::Show(show) = &module.components[0].root else {
        panic!("Show must lower as a builtin root");
    };
    assert!(matches!(
        show.fallback,
        Some(ComponentPropValueIr::Children(_))
    ));
}

#[test]
fn lowers_array_literal_nested_jsx_region() {
    let source = "export const App = props => <div>{[<A />, props.value, <B />]}</div>";
    let lowered = lower_module(source, "nested-array-literal.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("array literal produces IR");
    let root = root_element(&module.components[0].root);
    let ChildIr::DynamicRegion(region) = &root.children[0] else {
        panic!("array literal must lower to a dynamic region");
    };
    let zeus_compiler::ir::DynamicRegionExpressionIr::ArrayLiteral { items } = &region.expression
    else {
        panic!("array literal must use the array literal region variant");
    };
    assert_eq!(items.len(), 3);
    assert!(matches!(
        items[0],
        zeus_compiler::ir::DynamicRegionValueIr::Children(_)
    ));
    assert!(matches!(
        items[1],
        zeus_compiler::ir::DynamicRegionValueIr::Expression(_)
    ));
    assert!(matches!(
        items[2],
        zeus_compiler::ir::DynamicRegionValueIr::Children(_)
    ));
}

#[test]
fn diagnoses_jsx_nested_in_unsupported_calls_and_array_spreads() {
    for (name, source, expected_code) in [
        (
            "call",
            "const render = value => value; export const App = () => <div>{render(<A />)}</div>",
            "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
        ),
        (
            "map-callback",
            "const render = value => value; export const App = props => <div>{props.items.map(item => render(<A />))}</div>",
            "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
        ),
        (
            "array-spread",
            "export const App = props => <div>{[...props.children, <A />]}</div>",
            "ZEUS_UNSUPPORTED_ARRAY_SPREAD",
        ),
    ] {
        let lowered = lower_module(source, &format!("nested-jsx-{name}.tsx"));
        assert!(lowered.ir.is_none(), "{name}: invalid IR must not escape");
        assert_eq!(
            lowered
                .diagnostics
                .iter()
                .map(|diagnostic| diagnostic.code.as_str())
                .collect::<Vec<_>>(),
            [expected_code],
            "{name}: {:?}",
            lowered.diagnostics
        );
        assert!(
            lowered.diagnostics[0].span.is_some(),
            "{name}: diagnostic must include a source span"
        );
    }
}

#[test]
fn lowers_supported_raw_text_elements_and_rejects_nested_elements() {
    let source = "export const App = value => <style>{value}</style>";
    let lowered = lower_module(source, "raw-text.tsx");

    assert!(lowered.diagnostics.is_empty());
    let ir = lowered.ir.expect("supported raw-text element lowers");
    let root = root_element(&ir.components[0].root);
    assert_eq!(root.tag_name, "style");
    assert!(matches!(
        root.children.as_slice(),
        [ChildIr::DynamicText(_)]
    ));

    let nested = lower_module(
        "export const App = value => <style><span>{value}</span></style>",
        "raw-text-nested.tsx",
    );
    assert!(nested.ir.is_none());
    assert_eq!(nested.diagnostics.len(), 1);
    assert_eq!(
        nested.diagnostics[0].code,
        "ZEUS_UNSUPPORTED_RAW_TEXT_CHILD"
    );
}

#[test]
fn lowers_scalar_calls_and_rejects_dynamic_regions_in_raw_text_elements() {
    let scalar = lower_module(
        "export const App = props => <style>{props.value()}</style>",
        "raw-text-call.tsx",
    );
    assert!(scalar.diagnostics.is_empty(), "{:?}", scalar.diagnostics);
    let module = scalar.ir.expect("raw-text scalar call produces IR");
    let root = root_element(&module.components[0].root);
    assert!(matches!(
        root.children.as_slice(),
        [ChildIr::DynamicText(_)]
    ));

    for (name, source) in [
        (
            "conditional",
            "export const App = props => <style>{props.visible ? <b /> : null}</style>",
        ),
        ("array", "export const App = () => <style>{[<b />]}</style>"),
        (
            "array-map",
            "export const App = props => <style>{props.items.map(item => <b>{item}</b>)}</style>",
        ),
    ] {
        let lowered = lower_module(source, &format!("raw-text-{name}.tsx"));
        assert!(lowered.ir.is_none(), "{name}: invalid IR must not escape");
        assert_eq!(
            lowered.diagnostics.len(),
            1,
            "{name}: {:?}",
            lowered.diagnostics
        );
        assert_eq!(
            lowered.diagnostics[0].code,
            "ZEUS_UNSUPPORTED_RAW_TEXT_CHILD"
        );
        assert!(lowered.diagnostics[0].span.is_some(), "{name}");
    }
}

#[test]
fn rejects_elements_whose_children_need_dedicated_anchor_codegen() {
    for (source, expected_code) in [
        (
            "export const App = value => <template>{value}</template>",
            "ZEUS_UNSUPPORTED_TEMPLATE_ELEMENT",
        ),
        (
            "export const App = value => <input>{value}</input>",
            "ZEUS_UNSUPPORTED_VOID_ELEMENT_CHILDREN",
        ),
        (
            "export const App = value => <html>{value}</html>",
            "ZEUS_UNSUPPORTED_DOCUMENT_ELEMENT",
        ),
        (
            "export const App = () => <frame />",
            "ZEUS_UNSUPPORTED_DOCUMENT_ELEMENT",
        ),
        (
            "export const App = value => <image>{value}</image>",
            "ZEUS_UNSUPPORTED_VOID_ELEMENT_CHILDREN",
        ),
    ] {
        let lowered = lower_module(source, "anchor.tsx");

        assert!(lowered.ir.is_none());
        assert_eq!(lowered.diagnostics.len(), 1);
        assert_eq!(lowered.diagnostics[0].code, expected_code);
    }
}

#[test]
fn lowers_dom_attribute_binding_variants() {
    let source = r#"export const App = props => (
  <input
    className="field"
    disabled
    title={props.title}
    class={props.classes}
    style={props.style}
    prop:value={props.value}
    onClick={props.handlers.click}
    ref={props.input}
  />
)"#;
    let lowered = lower_module(source, "bindings.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("valid DOM bindings produce IR");
    let attributes = &root_element(&module.components[0].root).attributes;

    let AttributeIr::Static(class_name) = &attributes[0] else {
        panic!("className must be a static attribute");
    };
    assert_eq!(class_name.name, "class");
    assert_eq!(
        class_name.value,
        StaticAttributeValue::String("field".into())
    );

    let AttributeIr::Static(disabled) = &attributes[1] else {
        panic!("disabled must be a static attribute");
    };
    assert_eq!(disabled.value, StaticAttributeValue::Boolean);

    let AttributeIr::Dynamic(title) = &attributes[2] else {
        panic!("title must be an attribute binding");
    };
    assert_eq!(title.name, "title");
    assert_eq!(title.expression.form, ExpressionForm::Member);

    let AttributeIr::Dynamic(class) = &attributes[3] else {
        panic!("class must be an attribute binding");
    };
    assert_eq!(class.name, "class");

    let AttributeIr::Dynamic(style) = &attributes[4] else {
        panic!("style must be an attribute binding");
    };
    assert_eq!(style.expression.form, ExpressionForm::Member);

    let AttributeIr::Property(property) = &attributes[5] else {
        panic!("prop:value must be a property binding");
    };
    assert_eq!(property.name, "value");
    assert_eq!(property.expression.code, "props.value");

    let AttributeIr::Event(event) = &attributes[6] else {
        panic!("onClick must be an event binding");
    };
    assert_eq!(event.event_name, "click");
    assert_eq!(event.handler.form, ExpressionForm::Member);

    let AttributeIr::Ref(reference) = &attributes[7] else {
        panic!("ref must be a ref binding");
    };
    assert_eq!(reference.expression.code, "props.input");
}

#[test]
fn reports_stable_attribute_binding_diagnostics() {
    for (source, expected_code) in [
        (
            "export const App = () => <div ref />",
            "ZEUS_EMPTY_EXPRESSION",
        ),
        (
            "export const App = () => <div ref=\"target\" />",
            "ZEUS_INVALID_REF_USAGE",
        ),
        (
            "export const App = value => <div prop:value=\"value\" />",
            "ZEUS_INVALID_PROPERTY_BINDING",
        ),
        (
            "export const App = value => <div xml:lang={value} />",
            "ZEUS_UNSUPPORTED_NAMESPACED_ATTRIBUTE",
        ),
    ] {
        let lowered = lower_module(source, "attribute-diagnostic.tsx");

        assert!(lowered.ir.is_none());
        assert_eq!(lowered.diagnostics.len(), 1);
        assert_eq!(lowered.diagnostics[0].code, expected_code);
        assert!(lowered.diagnostics[0].span.is_some());
    }
}

#[test]
fn preserves_wrapped_function_and_member_expression_forms() {
    let source = r"export const App = (props, handlers, inputRef) => (
  <button
    title={(props.title)}
    prop:formatter={(() => props.value) as () => string}
    onClick={handlers?.['click']}
    ref={inputRef!}
  />
)";
    let lowered = lower_module(source, "expression-forms.tsx");

    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("valid forms produce IR");
    let attributes = &root_element(&module.components[0].root).attributes;

    let AttributeIr::Dynamic(title) = &attributes[0] else {
        panic!("title must be dynamic");
    };
    assert_eq!(title.expression.form, ExpressionForm::Member);

    let AttributeIr::Property(value) = &attributes[1] else {
        panic!("data-value must be dynamic");
    };
    assert_eq!(value.expression.form, ExpressionForm::Function);

    let AttributeIr::Event(event) = &attributes[2] else {
        panic!("onClick must be an event");
    };
    assert_eq!(event.handler.form, ExpressionForm::Member);

    let AttributeIr::Ref(reference) = &attributes[3] else {
        panic!("ref must be a ref binding");
    };
    assert_eq!(reference.expression.form, ExpressionForm::Value);
}

#[test]
fn recognizes_parenthesized_host_in_generic_define_element_setup() {
    let source = r"import { Host, Slot, defineElement } from '@zeus-js/zeus';
interface Props { label: string }
export const Button = defineElement<Props>('z-button', {}, (props, ctx) => (
  <Host><button>{props.label}<Slot /></button></Host>
));";
    let lowered = lower_module(source, "generic-host.tsx");
    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    assert!(lowered.ir.is_some());
}

#[test]
fn preserves_component_prop_names_without_dom_alias_normalization() {
    let source = r#"const Child = props => <span>{props.className}:{props.htmlFor}:{props.tabIndex}:{props.readOnly}</span>
export const App = () => <Child className="a" htmlFor="b" tabIndex={1} readOnly />"#;
    let lowered = lower_module(source, "component-prop-names.tsx");
    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("component props produce IR");
    let RootIr::Component(component) = &module.components.last().expect("App component").root
    else {
        panic!("expected component root");
    };
    let names: Vec<_> = component
        .props
        .iter()
        .filter_map(|prop| match prop {
            ComponentPropIr::Named(named) => Some(named.name.as_str()),
            ComponentPropIr::Spread(_) => None,
        })
        .collect();
    assert_eq!(names, vec!["className", "htmlFor", "tabIndex", "readOnly"]);
}

#[test]
fn rejects_nested_jsx_in_spreads_and_spreads_on_compiler_builtins() {
    for source in [
        "export const App = () => <div {...(<Child />)} />",
        "import { Show } from '@zeus-js/zeus'; export const App = () => <Show {...props} when={true}><b /></Show>",
        "import { For } from '@zeus-js/zeus'; export const App = () => <For {...props} each={items}>{item => <b>{item}</b>}</For>",
    ] {
        let lowered = lower_module(source, "invalid-spread.tsx");
        assert!(lowered.ir.is_none());
        assert_eq!(lowered.diagnostics.len(), 1, "{:?}", lowered.diagnostics);
        assert!(lowered.diagnostics[0].span.is_some());
    }
}

#[test]
fn rejects_function_values_for_control_builtins_and_dynamic_slot_names() {
    for (source, expected) in [
        (
            "import { Show } from '@zeus-js/zeus'; export const App = () => <Show when={() => true}>yes</Show>",
            "ZEUS_FUNCTION_BUILTIN_VALUE",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = () => <For each={() => items}>{item => item}</For>",
            "ZEUS_FUNCTION_BUILTIN_VALUE",
        ),
        (
            "import { defineElement, Host, Slot } from '@zeus-js/zeus'; export const App = defineElement('z-slot', {}, () => <Host><Slot name={slotName} /></Host>)",
            "ZEUS_INVALID_SLOT_NAME",
        ),
        (
            "const Child = props => <span />; export const App = () => <Child prop:value={1} />",
            "ZEUS_UNSUPPORTED_COMPONENT_PROP_NAMESPACE",
        ),
    ] {
        let lowered = lower_module(source, "builtin-value-diagnostic.tsx");
        assert!(lowered.ir.is_none(), "{expected}: {:?}", lowered.ir);
        assert_eq!(
            lowered.diagnostics.len(),
            1,
            "{expected}: {:?}",
            lowered.diagnostics
        );
        assert_eq!(lowered.diagnostics[0].code, expected);
        assert!(lowered.diagnostics[0].span.is_some());
    }
}

#[test]
fn rejects_unknown_attributes_on_control_builtins_without_dropping_them() {
    for (source, expected_code, expected_message) in [
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.ok} extra={<i>ignored</i>}><b>on</b></Show>",
            "ZEUS_INVALID_BUILTIN_USAGE",
            "Builtin `Show` does not accept the `extra` attribute",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items} extra={<i>ignored</i>}>{item => <b>{item}</b>}</For>",
            "ZEUS_INVALID_BUILTIN_USAGE",
            "Builtin `For` does not accept the `extra` attribute",
        ),
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.ok} when={<i>ignored</i>}><b>on</b></Show>",
            "ZEUS_INVALID_BUILTIN_USAGE",
            "`when` is duplicated",
        ),
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.ok} fallback=\"off\" fallback={<i>ignored</i>}><b>on</b></Show>",
            "ZEUS_INVALID_BUILTIN_USAGE",
            "`fallback` is duplicated",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items} each={<i>ignored</i>}>{item => <b>{item}</b>}</For>",
            "ZEUS_INVALID_BUILTIN_USAGE",
            "`each` is duplicated",
        ),
        (
            "export const App = props => <div>{props.items.map(item => <b>{item}</b>, <i>ignored</i>)}</div>",
            "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
            "JSX in additional Array.map arguments is not supported",
        ),
    ] {
        let lowered = lower_module(source, "invalid-builtin-or-map-argument.tsx");
        assert!(lowered.ir.is_none(), "unexpected IR: {:?}", lowered.ir);
        assert_eq!(lowered.diagnostics.len(), 1, "{:?}", lowered.diagnostics);
        assert_eq!(lowered.diagnostics[0].code, expected_code);
        assert!(lowered.diagnostics[0].message.contains(expected_message));
        let span = lowered.diagnostics[0].span.expect("attribute span");
        assert!(span.start.offset < span.end.offset);
    }
}

#[test]
fn lowers_transition_intrinsic_with_explicit_runtime_options() {
    let source = r#"import { Transition } from '@zeus-js/zeus';
export const App = props => <Transition when={props.open} enter="fade-in" leave={props.leave} duration={120} onEnterDone={props.done}><span>{props.label}</span></Transition>"#;
    let lowered = lower_module(source, "transition.tsx");
    assert!(lowered.diagnostics.is_empty(), "{:?}", lowered.diagnostics);
    let module = lowered.ir.expect("Transition lowers to native IR");
    let zeus_compiler::ir::RootIr::Transition(transition) = &module.components[0].root else {
        panic!("expected Transition root")
    };
    assert_eq!(transition.kind, "Transition");
    assert_eq!(transition.when.code, "props.open");
    assert_eq!(transition.children.len(), 1);
    assert_eq!(
        transition
            .options
            .iter()
            .map(|option| option.name.as_str())
            .collect::<Vec<_>>(),
        vec!["enter", "leave", "duration", "onEnterDone"]
    );
    assert_eq!(transition.options[0].expression.code, "\"fade-in\"");
    assert_eq!(transition.options[2].expression.code, "120");
}

#[test]
fn diagnoses_transition_unknown_and_jsx_options() {
    for (source, code) in [
        (
            "import { Transition } from '@zeus-js/zeus'; export const App = props => <Transition when={props.open} fallback={<i />} />",
            "ZEUS_INVALID_BUILTIN_USAGE",
        ),
        (
            "import { Transition } from '@zeus-js/zeus'; export const App = props => <Transition when={props.open} enter={<i />} />",
            "ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE",
        ),
    ] {
        let lowered = lower_module(source, "invalid-transition.tsx");
        assert!(lowered.ir.is_none(), "unexpected IR: {:?}", lowered.ir);
        assert_eq!(lowered.diagnostics.len(), 1, "{:?}", lowered.diagnostics);
        assert_eq!(lowered.diagnostics[0].code, code);
        assert!(lowered.diagnostics[0].span.is_some());
    }
}
