use zeus_compiler::{
    diagnostic::{CompilerDiagnostic, DiagnosticSeverity},
    ir::{
        AttributeIr, ComponentIr, DynamicTextIr, ElementIr, ExpressionIr, IrRef, ModuleIr,
        StaticAttributeIr, TextIr,
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
fn ir_owned_schema_round_trips_through_json() {
    let module = ModuleIr {
        id: 0,
        kind: "Module".into(),
        components: vec![ComponentIr {
            id: 1,
            kind: "Component".into(),
            span: span(0, 38),
            root: ElementIr {
                id: 2,
                kind: "Element".into(),
                reference: IrRef { node_id: 2 },
                tag_name: "div".into(),
                span: span(0, 38),
                attributes: vec![AttributeIr::Static(StaticAttributeIr {
                    id: 3,
                    kind: "StaticAttribute".into(),
                    name: "class".into(),
                    value: "greeting".into(),
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
                        },
                        span: span(28, 40),
                    }
                    .into(),
                ],
            },
        }],
    };

    let json = serde_json::to_string(&module).expect("IR serializes");
    let decoded: ModuleIr = serde_json::from_str(&json).expect("IR deserializes");

    assert_eq!(decoded, module);
    assert!(!json.contains("oxc"));
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
