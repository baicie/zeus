use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_sourcemap::SourceMap;
use oxc_span::SourceType;
use zeus_compiler::{TransformModuleOptions, TransformTarget, transform_module};

const FIXTURE: &str = r#"export const App = (props: { name: string }) => (
  <div class="greeting">Hello {props.name}</div>
)
"#;

fn options(source_map: bool) -> TransformModuleOptions {
    TransformModuleOptions {
        source: FIXTURE.into(),
        filename: "App.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map,
    }
}

#[test]
fn emits_static_template_and_precise_dynamic_text_binding() {
    let transformed = transform_module(options(true));

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("template"));
    assert!(transformed.code.contains("insert"));
    assert!(transformed.code.contains("bindText"));
    assert!(
        transformed
            .code
            .contains(r#"<div class=\"greeting\">Hello <!></div>"#)
    );

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "generated output must parse as TypeScript without JSX: {:?}",
        parsed.diagnostics
    );

    let expression_index = transformed
        .code
        .rfind("props.name")
        .expect("generated binding contains source expression");
    let generated_prefix = &transformed.code[..expression_index];
    let generated_line = u32::try_from(generated_prefix.matches('\n').count()).unwrap();
    let generated_column = u32::try_from(
        generated_prefix
            .rsplit_once('\n')
            .map_or(generated_prefix, |(_, tail)| tail)
            .encode_utf16()
            .count(),
    )
    .unwrap();

    let map = transformed.map.expect("source map requested");
    let map_json = serde_json::to_string(&map).expect("map serializes");
    let source_map = SourceMap::from_json_string(&map_json).expect("valid source map v3");
    let lookup = source_map.generate_lookup_table();
    let token = source_map
        .lookup_token(&lookup, generated_line, generated_column)
        .expect("dynamic expression has mapping");

    let original_prefix = &FIXTURE[..FIXTURE.find("props.name}</div>").unwrap()];
    assert_eq!(
        token.get_src_line(),
        u32::try_from(original_prefix.matches('\n').count()).unwrap()
    );
    assert_eq!(
        token.get_src_col(),
        u32::try_from(
            original_prefix
                .rsplit_once('\n')
                .map_or(original_prefix, |(_, tail)| tail)
                .encode_utf16()
                .count()
        )
        .unwrap()
    );
}

#[test]
fn avoids_collisions_with_user_bindings() {
    let source = r"const $zeusTemplate = 1
const $zeusTemplate0 = 2
export const App = props => <div>{props.name}</div>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "collision.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("template as $zeusTemplate1"));
}

#[test]
fn returns_diagnostics_without_emitting_partial_code() {
    let transformed = transform_module(TransformModuleOptions {
        source: "export const App = props => <div {...props} />".into(),
        filename: "spread.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(transformed.code.is_empty());
    assert!(transformed.map.is_none());
    assert_eq!(
        transformed.diagnostics[0].code,
        "ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE"
    );
}
