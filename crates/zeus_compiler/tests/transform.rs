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
fn avoids_collisions_with_unresolved_references() {
    let source = "export const App = () => <div>{$zeusEl}</div>\n";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "global-reference.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("const $zeusEl0 ="));
    assert!(transformed.code.contains("() => ($zeusEl))"));
}

#[test]
fn preserves_object_literal_expression_semantics() {
    let source = "export const App = () => <div>{{ value: 1 }}</div>\n";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "object-expression.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("() => ({ value: 1 })"));
}

#[test]
fn does_not_resolve_text_creation_through_component_scope() {
    let source = "export const App = document => <div>{document}</div>\n";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "shadowed-document.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains(".ownerDocument.createTextNode"));
    assert!(!transformed.code.contains("document.createTextNode"));
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

#[test]
fn emits_event_bindings_and_sorted_deduplicated_delegation() {
    let source = r"const $zeusEvent = null
export const App = (inlineHandler, identifierHandler, theme, maybe, props, assertedTheme) => (
  <section onInput={event => inlineHandler(event)}>
    <button onClick={identifierHandler}>identifier</button>
    <button onClick={theme.toggle}>member</button>
    <button onClick={maybe?.toggle}>optional</button>
    <button onClick={props.handlers['click']}>computed</button>
    <button onClick={assertedTheme.toggle as typeof assertedTheme.toggle}>asserted</button>
  </section>
)
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "event.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: true,
        source_map: true,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("bindEvent as"));
    assert!(transformed.code.contains("delegateEvents as"));
    assert!(
        transformed
            .code
            .contains(", \"input\", event => inlineHandler(event));")
    );
    assert!(
        transformed
            .code
            .contains(", \"click\", identifierHandler);")
    );
    assert!(
        transformed
            .code
            .contains("$zeusEvent0 => (theme.toggle)?.($zeusEvent0)")
    );
    assert!(
        transformed
            .code
            .contains("$zeusEvent1 => (maybe?.toggle)?.($zeusEvent1)")
    );
    assert!(
        transformed
            .code
            .contains("$zeusEvent2 => (props.handlers['click'])?.($zeusEvent2)")
    );
    assert!(transformed.code.contains(
        "$zeusEvent3 => (assertedTheme.toggle as typeof assertedTheme.toggle)?.($zeusEvent3)"
    ));
    assert_eq!(transformed.code.matches("$zeusDelegateEvents([").count(), 1);
    assert!(
        transformed
            .code
            .contains("$zeusDelegateEvents([\"click\", \"input\"]);")
    );

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "generated event output must parse: {:?}",
        parsed.diagnostics
    );

    for expression in [
        "event => inlineHandler(event)",
        "identifierHandler",
        "theme.toggle",
        "maybe?.toggle",
        "props.handlers['click']",
        "assertedTheme.toggle as typeof assertedTheme.toggle",
    ] {
        assert_expression_mapping(source, &transformed, expression);
    }

    let without_delegation = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "event.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
    });

    assert!(without_delegation.diagnostics.is_empty());
    assert!(without_delegation.code.contains("bindEvent as"));
    assert!(!without_delegation.code.contains("delegateEvents as"));
    assert!(!without_delegation.code.contains("$zeusDelegateEvents(["));
}

#[test]
fn leaves_plain_modules_untouched_and_preserves_directive_prologue() {
    let plain_source = "export const value: number = 1\n";
    let plain = transform_module(TransformModuleOptions {
        source: plain_source.into(),
        filename: "plain.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(plain.diagnostics.is_empty());
    assert_eq!(plain.code, plain_source);
    assert!(plain.map.is_none());

    let directive_source =
        "#!/usr/bin/env node\n\"use client\";\nexport const App = () => <div>Hello</div>\n";
    let directive = transform_module(TransformModuleOptions {
        source: directive_source.into(),
        filename: "directive.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
    });

    assert!(directive.diagnostics.is_empty());
    assert!(
        directive
            .code
            .starts_with("#!/usr/bin/env node\n\"use client\";\nimport {")
    );
}

#[test]
fn emits_attribute_property_and_ref_bindings_with_stable_locators() {
    let source = r"export const App = (props, inputRef) => (
  <section title={props.title}>
    prefix
    <div className={props.className} style={() => props.style}>
      <input prop:value={props.value} ref={inputRef} />
    </div>
    <table><tr data-row={props.row}><td>cell</td></tr></table>
  </section>
)
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "bindings.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("bindAttr as"));
    assert!(transformed.code.contains("bindClass as"));
    assert!(transformed.code.contains("bindStyle as"));
    assert!(transformed.code.contains("bindProp as"));
    assert!(transformed.code.contains("bindRef as"));
    assert!(transformed.code.contains(".querySelector("));
    assert!(transformed.code.contains(".removeAttribute("));
    assert!(!transformed.code.contains(".childNodes["));
    assert!(transformed.code.contains("() => (props.title)"));
    assert!(transformed.code.contains("() => props.style"));
    assert!(!transformed.code.contains("() => (() => props.style)"));
    assert!(transformed.code.contains(", inputRef);"));
    assert!(!transformed.code.contains("() => (inputRef)"));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "generated binding output must parse: {:?}",
        parsed.diagnostics
    );

    for expression in [
        "props.title",
        "props.className",
        "() => props.style",
        "props.value",
        "inputRef",
        "props.row",
    ] {
        assert_expression_mapping(source, &transformed, expression);
    }
}

#[test]
fn emits_raw_text_bindings_and_preserves_raw_template_text() {
    let source = r#"export const Script = value => <script>const amp = "a&b";{value}</script>
export const Style = value => <style>.x: color red; {value}</style>
export const Textarea = value => <textarea>prefix {value}</textarea>
export const Title = value => <title>prefix {value}</title>
export const Static = () => <script>const amp = "a&b";</script>
"#;
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "raw-text.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("bindTextContent as"));
    assert!(
        transformed
            .code
            .contains(r#"<script>const amp = \"a&b\";</script>"#)
    );
    assert!(transformed.code.contains(r"<style data-zeus-node="));
    assert!(transformed.code.contains(r"<textarea data-zeus-node="));
    assert!(transformed.code.contains(r"<title data-zeus-node="));
    assert!(
        !transformed
            .code
            .contains(r#"<script>const amp = \"a&b\";<!></script>"#)
    );
    assert_eq!(transformed.code.matches("$zeusBindTextContent(").count(), 4);
    assert!(
        transformed
            .code
            .contains("[\"const amp = \\\"a&b\\\";\", value]")
    );

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "generated raw-text output must parse: {:?}",
        parsed.diagnostics
    );
    assert_expression_mapping(source, &transformed, "value");
}

#[test]
fn emits_root_and_nested_fragment_templates_with_stable_markers() {
    let source = r"export const App = props => <><span>{props.first}</span><><b>static</b>{props.second}</></>";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "fragment.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("template as"));
    assert!(
        transformed
            .code
            .contains("<span><!></span><b>static</b><!>")
    );
    assert!(transformed.code.contains("createTreeWalker"));
    assert_eq!(transformed.code.matches("bindText as").count(), 1);
    assert_eq!(transformed.code.matches("createTextNode(\"\")").count(), 2);

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "fragment output must parse: {:?}",
        parsed.diagnostics
    );
    for expression in ["props.first", "props.second"] {
        assert_expression_mapping(source, &transformed, expression);
    }
}

#[test]
fn emits_component_calls_with_lazy_props_and_initialized_children() {
    let source = r"const Child = props => <article>{props.title}{props.children}</article>
export const App = props => <section><Child title={props.name}><span>{props.name}</span></Child></section>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "component.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("createComponent as"));
    assert!(
        transformed
            .code
            .contains("get title() { return props.name }")
    );
    assert!(transformed.code.contains("get children() { return"));
    assert!(!transformed.code.contains("<section><Child"));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "component output must parse: {:?}",
        parsed.diagnostics
    );
    assert_expression_mapping(source, &transformed, "props.name");
}

#[test]
fn emits_nested_control_flow_inside_component_children() {
    let source = r"import { Show, For } from '@zeus-js/runtime-dom'
const Child = props => <article>{props.children}</article>
export const App = props => <Child><Show when={props.visible}><span>on</span></Show><For each={props.items}>{item => <b>{item}</b>}</For></Child>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "nested-control-flow.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("createComponent as"));
    assert!(
        transformed
            .code
            .contains("get when() { return props.visible }")
    );
    assert!(
        transformed
            .code
            .contains("get each() { return props.items }")
    );
    assert!(!transformed.code.contains("requires a DOM anchor"));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "nested control-flow output must parse: {:?}",
        parsed.diagnostics
    );
}

#[test]
fn emits_show_and_for_mounts_with_stable_region_markers() {
    let source = r#"import { Show, For } from '@zeus-js/zeus'
export const App = props => <div><Show when={props.visible} fallback="hidden"><span>{props.name}</span></Show><For each={props.items}>{item => <b>{item}</b>}</For></div>
"#;
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "control-flow.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("mountShow as"));
    assert!(transformed.code.contains("mountFor as"));
    assert!(transformed.code.contains("() => props.visible"));
    assert!(transformed.code.contains("() => props.items"));
    assert!(!transformed.code.contains("<Show"));
    assert!(!transformed.code.contains("<For"));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "control-flow output must parse: {:?}",
        parsed.diagnostics
    );
}

#[test]
fn emits_ssr_native_component_and_control_flow_calls() {
    let source = r#"import { Show } from '@zeus-js/runtime-ssr'
const Child = props => <p>{props.name}</p>
export const App = props => <><Show when={props.visible} fallback="off"><Child name={props.name} /></Show><div class={props.className}>Hello {props.name}</div></>
"#;
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "ssr.tsx".into(),
        target: TransformTarget::Ssr,
        runtime_module: "@zeus-js/runtime-ssr".into(),
        delegate_events: false,
        source_map: true,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("ssrElement as"));
    assert!(transformed.code.contains("ssrComponent as"));
    assert!(transformed.code.contains("ssrShow as"));
    assert!(transformed.code.contains("ssrText as"));
    assert!(!transformed.code.contains("<div"));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "SSR output must parse: {:?}",
        parsed.diagnostics
    );
}

#[test]
fn emits_svg_namespace_flag_and_valid_void_custom_templates() {
    let source = r#"export const Icon = props => <svg viewBox="0 0 1 1"><circle data-r={props.radius} /></svg>
export const Native = props => <z-card data-value={props.value}><input disabled /></z-card>
"#;
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "special-elements.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("template as"));
    assert!(transformed.code.contains("\", false, true)"));
    assert!(!transformed.code.contains("<input disabled></input>"));
    assert!(transformed.code.contains("<z-card"));
    assert!(transformed.code.contains("<input disabled>"));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "generated special-element output must parse: {:?}",
        parsed.diagnostics
    );
}

fn assert_expression_mapping(
    source: &str,
    transformed: &zeus_compiler::TransformModuleResult,
    expression: &str,
) {
    let generated_index = transformed
        .code
        .rfind(expression)
        .unwrap_or_else(|| panic!("generated output contains {expression}"));
    let generated_prefix = &transformed.code[..generated_index];
    let generated_line = u32::try_from(generated_prefix.matches('\n').count()).unwrap();
    let generated_column = u32::try_from(
        generated_prefix
            .rsplit_once('\n')
            .map_or(generated_prefix, |(_, tail)| tail)
            .encode_utf16()
            .count(),
    )
    .unwrap();

    let map_json = serde_json::to_string(transformed.map.as_ref().expect("map requested"))
        .expect("map serializes");
    let source_map = SourceMap::from_json_string(&map_json).expect("valid source map v3");
    let lookup = source_map.generate_lookup_table();
    let token = source_map
        .lookup_token(&lookup, generated_line, generated_column)
        .unwrap_or_else(|| panic!("{expression} has a source mapping"));
    let original_index = source
        .rfind(expression)
        .unwrap_or_else(|| panic!("source contains {expression}"));
    let original_prefix = &source[..original_index];

    assert_eq!(
        token.get_src_line(),
        u32::try_from(original_prefix.matches('\n').count()).unwrap(),
        "line mapping for {expression}"
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
        .unwrap(),
        "column mapping for {expression}"
    );
}
