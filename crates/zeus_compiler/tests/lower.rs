use std::thread;

use zeus_compiler::{
    ir::{AttributeIr, ChildIr},
    lower::lower_module,
};

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
    assert_eq!(component.id, 1);
    assert_eq!(component.root.id, 2);
    assert_eq!(component.root.reference.node_id, 2);
    assert_eq!(component.root.tag_name, "div");

    let AttributeIr::Static(class) = &component.root.attributes[0] else {
        panic!("class must be lowered as a static attribute");
    };
    assert_eq!(class.id, 3);
    assert_eq!(class.name, "class");
    assert_eq!(class.value, "greeting");

    let ChildIr::Text(text) = &component.root.children[0] else {
        panic!("first child must be static text");
    };
    assert_eq!(text.id, 4);
    assert_eq!(text.value, "Hello ");

    let ChildIr::DynamicText(dynamic) = &component.root.children[1] else {
        panic!("second child must be dynamic text");
    };
    assert_eq!(dynamic.id, 5);
    assert_eq!(dynamic.reference.node_id, 5);
    assert_eq!(dynamic.expression.code, "props.name");
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
    let ChildIr::DynamicText(dynamic) = &module.components[0].root.children[0] else {
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
fn rejects_component_elements_with_stable_diagnostic() {
    let source = "export const App = () => <Widget />";
    let lowered = lower_module(source, "component.tsx");

    assert!(lowered.ir.is_none());
    assert_eq!(lowered.diagnostics.len(), 1);
    assert_eq!(lowered.diagnostics[0].code, "ZEUS_UNSUPPORTED_COMPONENT");
    assert_eq!(lowered.diagnostics[0].filename, "component.tsx");
    assert!(lowered.diagnostics[0].span.is_some());
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
fn rejects_raw_text_elements_until_they_have_dedicated_codegen() {
    let source = "export const App = value => <style>{value}</style>";
    let lowered = lower_module(source, "raw-text.tsx");

    assert!(lowered.ir.is_none());
    assert_eq!(lowered.diagnostics.len(), 1);
    assert_eq!(
        lowered.diagnostics[0].code,
        "ZEUS_UNSUPPORTED_RAW_TEXT_ELEMENT"
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
