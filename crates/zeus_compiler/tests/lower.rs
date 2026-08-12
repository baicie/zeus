use std::thread;

use zeus_compiler::{
    ir::{AttributeIr, ChildIr, ExpressionForm, RootIr, StaticAttributeValue},
    lower::lower_module,
};

fn root_element(root: &zeus_compiler::ir::RootIr) -> &zeus_compiler::ir::ElementIr {
    match root {
        zeus_compiler::ir::RootIr::Element(element) => element,
        zeus_compiler::ir::RootIr::Fragment(_)
        | zeus_compiler::ir::RootIr::Component(_)
        | zeus_compiler::ir::RootIr::Show(_)
        | zeus_compiler::ir::RootIr::For(_) => panic!("expected element root"),
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
fn rejects_spread_attributes_with_stable_diagnostic() {
    let source = "export const App = props => <div {...props} />";
    let lowered = lower_module(source, "spread.tsx");

    assert!(lowered.ir.is_none());
    assert_eq!(lowered.diagnostics.len(), 1);
    assert_eq!(
        lowered.diagnostics[0].code,
        "ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE"
    );
    assert_eq!(lowered.diagnostics[0].filename, "spread.tsx");
    assert!(lowered.diagnostics[0].span.is_some());
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
    assert_eq!(component.props[0].name, "title");
    assert_eq!(component.props[1].name, "enabled");
    assert_eq!(component.props[2].name, "children");
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
        component.props.last().map(|prop| &prop.value),
        Some(zeus_compiler::ir::ComponentPropValueIr::Children(_))
    ));
}

#[test]
fn rejects_nested_jsx_inside_dynamic_text_expression() {
    let source = "export const App = ok => <div>{ok ? <span /> : null}</div>";
    let lowered = lower_module(source, "nested-expression.tsx");

    assert!(lowered.ir.is_none());
    assert_eq!(lowered.diagnostics.len(), 1);
    assert_eq!(
        lowered.diagnostics[0].code,
        "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION"
    );
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
    style={() => props.style}
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
    assert_eq!(style.expression.form, ExpressionForm::Getter);

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
fn preserves_wrapped_getter_and_member_expression_forms() {
    let source = r"export const App = (props, handlers, inputRef) => (
  <button
    title={(props.title)}
    data-value={(() => props.value) as () => string}
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

    let AttributeIr::Dynamic(value) = &attributes[1] else {
        panic!("data-value must be dynamic");
    };
    assert_eq!(value.expression.form, ExpressionForm::Getter);

    let AttributeIr::Event(event) = &attributes[2] else {
        panic!("onClick must be an event");
    };
    assert_eq!(event.handler.form, ExpressionForm::Member);

    let AttributeIr::Ref(reference) = &attributes[3] else {
        panic!("ref must be a ref binding");
    };
    assert_eq!(reference.expression.form, ExpressionForm::Value);
}
