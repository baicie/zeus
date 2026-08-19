use zeus_compiler::{
    diagnostic::{CompilerDiagnostic, DiagnosticSeverity},
    ir::{
        AttrBindingIr, AttributeIr, ComponentIr, DynamicTextIr, ElementIr, ExpressionForm,
        ExpressionIr, ForAccessorIr, FragmentIr, IrRef, ModuleIr, RootIr, StaticAttributeIr,
        StaticAttributeValue, TextIr,
    },
    span::{SourcePosition, SourceSpan},
};

fn span(start: u32, end: u32) -> SourceSpan {
    SourceSpan {
        start: SourcePosition {
            offset: start,
            line: 1,
            column: start,
        },
        end: SourcePosition {
            offset: end,
            line: 1,
            column: end,
        },
    }
}

#[test]
fn fragment_ir_round_trips_without_ast_types() {
    let module = ModuleIr {
        id: 0,
        kind: "Module".into(),
        preamble_end: 0,
        components: vec![ComponentIr {
            id: 1,
            kind: "Component".into(),
            span: span(0, 12),
            root: RootIr::Fragment(FragmentIr {
                id: 2,
                kind: "Fragment".into(),
                span: span(0, 12),
                children: vec![
                    TextIr {
                        id: 3,
                        kind: "Text".into(),
                        value: "before".into(),
                        span: span(2, 8),
                    }
                    .into(),
                    ElementIr {
                        id: 4,
                        kind: "Element".into(),
                        reference: IrRef { node_id: 4 },
                        tag_name: "strong".into(),
                        span: span(8, 25),
                        attributes: vec![],
                        children: vec![],
                    }
                    .into(),
                ],
            }),
        }],
    };

    let json = serde_json::to_string(&module).expect("fragment IR serializes");
    let decoded: ModuleIr = serde_json::from_str(&json).expect("fragment IR deserializes");
    assert_eq!(decoded, module);
    assert!(json.contains("Fragment"));
}

#[test]
fn ir_owned_schema_round_trips_through_json() {
    let module = ModuleIr {
        id: 0,
        kind: "Module".into(),
        preamble_end: 0,
        components: vec![ComponentIr {
            id: 1,
            kind: "Component".into(),
            span: span(0, 38),
            root: RootIr::Element(ElementIr {
                id: 2,
                kind: "Element".into(),
                reference: IrRef { node_id: 2 },
                tag_name: "div".into(),
                span: span(0, 38),
                attributes: vec![AttributeIr::Static(StaticAttributeIr {
                    id: 3,
                    name: "class".into(),
                    value: StaticAttributeValue::String("greeting".into()),
                    span: span(5, 21),
                })],
                children: vec![
                    TextIr {
                        id: 4,
                        kind: "Text".into(),
                        value: "Hello ".into(),
                        span: span(22, 28),
                    }
                    .into(),
                    DynamicTextIr {
                        id: 5,
                        kind: "DynamicText".into(),
                        reference: IrRef { node_id: 5 },
                        expression: ExpressionIr {
                            kind: "Expression".into(),
                            code: "props.name".into(),
                            span: span(29, 39),
                            form: ExpressionForm::Member,
                            for_accessors: Vec::new(),
                        },
                        once: false,
                        span: span(28, 40),
                    }
                    .into(),
                ],
            }),
        }],
    };

    let json = serde_json::to_string(&module).expect("IR serializes");
    let decoded: ModuleIr = serde_json::from_str(&json).expect("IR deserializes");

    assert_eq!(decoded, module);
    assert!(!json.contains("oxc"));
}

#[test]
fn attribute_ir_matches_compiler_shared_canonical_json() {
    let fixture =
        include_str!("../../../packages/core/compiler-shared/fixtures/attribute-bindings.json");
    let attributes: Vec<AttributeIr> = serde_json::from_str(fixture)
        .expect("canonical TypeScript IR fixture deserializes in Rust");
    let expected: serde_json::Value =
        serde_json::from_str(fixture).expect("canonical fixture is valid JSON");

    assert!(matches!(attributes[0], AttributeIr::Static(_)));
    assert!(matches!(attributes[2], AttributeIr::Dynamic(_)));
    assert!(matches!(attributes[3], AttributeIr::Property(_)));
    assert!(matches!(attributes[4], AttributeIr::Event(_)));
    assert!(matches!(attributes[5], AttributeIr::Ref(_)));
    assert_eq!(
        serde_json::to_value(attributes).expect("Rust IR serializes"),
        expected
    );

    let invalid = fixture.replacen("\"value\": true", "\"value\": false", 1);
    assert!(serde_json::from_str::<Vec<AttributeIr>>(&invalid).is_err());

    let missing_once = fixture.replacen("    \"once\": false,\n", "", 1);
    assert!(serde_json::from_str::<Vec<AttributeIr>>(&missing_once).is_err());
}

#[test]
fn once_binding_ir_round_trips_as_explicit_true() {
    let binding = AttrBindingIr {
        id: 1,
        name: "title".into(),
        expression: ExpressionIr {
            kind: "Expression".into(),
            code: "props.title".into(),
            span: span(8, 19),
            form: ExpressionForm::Member,
            for_accessors: Vec::new(),
        },
        once: true,
        span: span(1, 20),
    };

    let json = serde_json::to_value(&binding).expect("once binding serializes");
    assert_eq!(json["once"], true);
    assert_eq!(
        serde_json::from_value::<AttrBindingIr>(json).expect("once binding deserializes"),
        binding
    );
}

#[test]
fn for_accessor_dependencies_round_trip_through_json() {
    let expression = ExpressionIr {
        kind: "Expression".into(),
        code: "item.label".into(),
        span: span(8, 18),
        form: ExpressionForm::Member,
        for_accessors: vec![ForAccessorIr {
            for_id: 7,
            item: true,
            index: false,
        }],
    };

    let json = serde_json::to_value(&expression).expect("For accessor dependency serializes");
    assert_eq!(json["forAccessors"][0]["forId"], 7);
    assert_eq!(json["forAccessors"][0]["item"], true);
    assert_eq!(json["forAccessors"][0]["index"], false);
    assert_eq!(
        serde_json::from_value::<ExpressionIr>(json).expect("For accessor dependency deserializes"),
        expression
    );
}

#[test]
fn compiler_diagnostic_is_owned_and_structured() {
    let diagnostic = CompilerDiagnostic {
        code: "ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE".into(),
        message: "JSX spread attributes are not supported by this compiler slice.".into(),
        severity: DiagnosticSeverity::Error,
        filename: "fixture.tsx".into(),
        hint: None,
        span: Some(span(12, 22)),
    };

    let json = serde_json::to_value(diagnostic).expect("diagnostic serializes");
    assert_eq!(json["code"], "ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE");
    assert_eq!(json["severity"], "error");
    assert_eq!(json["filename"], "fixture.tsx");
    assert_eq!(json["span"]["start"]["offset"], 12);
}
