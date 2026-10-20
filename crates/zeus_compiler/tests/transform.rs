use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_sourcemap::SourceMap;
use oxc_span::SourceType;
use zeus_compiler::{
    PureDefineElementMode, TransformModuleOptions, TransformTarget, transform_module,
};

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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    }
}

#[test]
fn pure_define_element_mode_keeps_boolean_json_shape() {
    let enabled = serde_json::to_value(PureDefineElementMode::Enabled).unwrap();
    let disabled =
        serde_json::from_value::<PureDefineElementMode>(serde_json::Value::Bool(false)).unwrap();

    assert_eq!(enabled, serde_json::Value::Bool(true));
    assert_eq!(disabled, PureDefineElementMode::Disabled);
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
fn maps_spread_nested_jsx_dynamic_attributes_and_higher_order_callbacks() {
    let source = r"const Child = props => <article data-child={props.childAttribute}>{props.childText}</article>
export const App = props => (
  <section {...props.spreadAttributes} data-title={props.dynamicAttribute}>
    <Child childAttribute={props.nestedAttribute} childText={props.nestedText} />
    <input prop:value={props.dynamicProperty} />
    {props.rows.map((row, index) => <button data-row={row.id} onClick={() => props.onRow(row, index)}>{row.label}</button>)}
  </section>
)
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "source-map-coverage.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: true,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "unexpected diagnostics: {:?}",
        transformed.diagnostics
    );
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "generated source-map fixture must parse: {:?}",
        parsed.diagnostics
    );

    for expression in [
        "props.childAttribute",
        "props.childText",
        "props.spreadAttributes",
        "props.dynamicAttribute",
        "props.nestedAttribute",
        "props.nestedText",
        "props.dynamicProperty",
        "props.rows",
        "row.id",
        "props.onRow(row, index)",
        "row.label",
    ] {
        assert_expression_mapping(source, &transformed, expression);
    }

    let ssr = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "source-map-coverage.tsx".into(),
        target: TransformTarget::Ssr,
        runtime_module: "@zeus-js/runtime-ssr".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });
    assert!(ssr.diagnostics.is_empty(), "{:?}", ssr.diagnostics);
    for expression in [
        "props.childAttribute",
        "props.childText",
        "props.spreadAttributes",
        "props.dynamicAttribute",
        "props.nestedAttribute",
        "props.nestedText",
        "props.dynamicProperty",
        "props.rows",
        "row.id",
        "row.label",
    ] {
        assert_expression_mapping(source, &ssr, expression);
    }
}

#[test]
fn marks_only_top_level_define_element_initializers_pure_when_requested() {
    let source = r"import { defineElement as define } from '@zeus-js/runtime-dom'
export const ZPackedButton = define<{ label: string }>('z-packed-button', {}, props => <button>{props.label}</button>)
export const ZPackedUnused = define('z-packed-unused', {}, () => <span>unused</span>)
export const LocalCall = (define => define('local-call', {}))(callback)
";
    let options = TransformModuleOptions {
        source: source.into(),
        filename: "components.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    };

    let ordinary = transform_module(options.clone());
    assert!(
        ordinary.diagnostics.is_empty(),
        "{:?}",
        ordinary.diagnostics
    );
    assert!(!ordinary.code.contains("/* @__PURE__ */ define"));

    let lazy = transform_module(TransformModuleOptions {
        pure_define_element: PureDefineElementMode::Enabled,
        ..options
    });
    assert!(lazy.diagnostics.is_empty(), "{:?}", lazy.diagnostics);
    assert_eq!(lazy.code.matches("/* @__PURE__ */ define").count(), 2);
    assert!(
        lazy.code
            .contains("ZPackedButton = /* @__PURE__ */ define<")
    );
    assert!(
        lazy.code
            .contains("ZPackedUnused = /* @__PURE__ */ define(")
    );
    assert!(lazy.code.contains("LocalCall = (define => define("));
}

#[test]
fn emits_once_intrinsics_without_changing_default_bindings() {
    let source = r"export const App = props => <div
  title={once(props.title)}
  class={once(props.className)}
  style={once(props.style)}
  prop:value={once(props.value)}
  data-live={props.live}
>{once(props.label)}{props.detail}</div>
export const Raw = props => <style>prefix {once(props.label)} {once(props.prefix)}</style>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "once.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("() => (props.title), true);"));
    assert!(transformed.code.contains("() => (props.className), true);"));
    assert!(transformed.code.contains("() => (props.style), true);"));
    assert!(transformed.code.contains("() => (props.value), true);"));
    assert!(transformed.code.contains("() => (props.label), true);"));
    assert!(transformed.code.contains("props.prefix"));
    assert!(transformed.code.contains("() => (props.live));"));
    assert!(transformed.code.contains("() => (props.detail));"));

    for expression in [
        "props.title",
        "props.className",
        "props.style",
        "props.value",
        "props.live",
        "props.detail",
    ] {
        assert_expression_mapping(source, &transformed, expression);
    }

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "generated output must remain valid TypeScript: {:?}",
        parsed.diagnostics
    );
}

#[test]
fn rejects_once_marked_node_bindings_before_codegen() {
    for (source, filename) in [
        (
            "export const App = children => <div>{/* @once */ children}</div>",
            "once-children-identifier.tsx",
        ),
        (
            "export const App = props => <div>{/* @once */ props.children}</div>",
            "once-children-member.tsx",
        ),
        (
            "export const App = props => <div>{/* @once */ props?.children}</div>",
            "once-children-optional.tsx",
        ),
        (
            "export const App = props => <div>{/* @once */ props['children']}</div>",
            "once-children-single-index.tsx",
        ),
        (
            "export const App = props => <div>{/* @once */ props[\"children\"]}</div>",
            "once-children-double-index.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items}>{item => <div>{/* @once */ item.children}</div>}</For>",
            "once-for-node-binding.tsx",
        ),
    ] {
        let transformed = transform_module(TransformModuleOptions {
            source: source.into(),
            filename: filename.into(),
            target: TransformTarget::Dom,
            runtime_module: "@zeus-js/runtime-dom".into(),
            delegate_events: false,
            source_map: false,
            hmr: false,
            pure_define_element: PureDefineElementMode::Disabled,
        });

        assert!(transformed.code.is_empty(), "{filename}");
        assert!(transformed.map.is_none(), "{filename}");
        assert_eq!(transformed.diagnostics.len(), 1, "{filename}");
        assert_eq!(
            transformed.diagnostics[0].code, "ZEUS_INVALID_ONCE_TARGET",
            "{filename}"
        );
    }
}

#[test]
fn rejects_once_markers_on_ignored_builtin_attributes() {
    for (source, filename) in [
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.visible} extra={/* @once */ props.extra}>yes</Show>",
            "once-show-unknown-attribute.tsx",
        ),
        (
            "import { For } from '@zeus-js/zeus'; export const App = props => <For each={props.items} each={/* @once */ props.other}>{item => item}</For>",
            "once-for-duplicate-attribute.tsx",
        ),
        (
            "import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.visible} {.../* @once */ props.extra}>yes</Show>",
            "once-show-spread-attribute.tsx",
        ),
    ] {
        let transformed = transform_module(TransformModuleOptions {
            source: source.into(),
            filename: filename.into(),
            target: TransformTarget::Dom,
            runtime_module: "@zeus-js/runtime-dom".into(),
            delegate_events: false,
            source_map: false,
            hmr: false,
            pure_define_element: PureDefineElementMode::Disabled,
        });

        assert!(transformed.code.is_empty(), "{filename}");
        assert!(transformed.map.is_none(), "{filename}");
        assert_eq!(transformed.diagnostics.len(), 1, "{filename}");
        assert_eq!(
            transformed.diagnostics[0].code, "ZEUS_INVALID_ONCE_TARGET",
            "{filename}"
        );
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
        let transformed = transform_module(TransformModuleOptions {
            source: source.into(),
            filename: filename.into(),
            target: TransformTarget::Dom,
            runtime_module: "@zeus-js/runtime-dom".into(),
            delegate_events: false,
            source_map: false,
            hmr: false,
            pure_define_element: PureDefineElementMode::Disabled,
        });

        assert!(transformed.code.is_empty(), "{filename}");
        assert_eq!(transformed.diagnostics.len(), 1, "{filename}");
        assert_eq!(transformed.diagnostics[0].code, "ZEUS_INVALID_ONCE_TARGET");
    }
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains(".ownerDocument.createTextNode"));
    assert!(!transformed.code.contains("document.createTextNode"));
}

#[test]
fn returns_diagnostics_without_emitting_partial_code() {
    let transformed = transform_module(TransformModuleOptions {
        source: "export const App = props => <div>{() => props.title}</div>".into(),
        filename: "spread.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(transformed.code.is_empty());
    assert!(transformed.map.is_none());
    assert_eq!(transformed.diagnostics[0].code, "ZEUS_FUNCTION_CHILD");
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(without_delegation.diagnostics.is_empty());
    assert!(without_delegation.code.contains("bindEvent as"));
    assert!(!without_delegation.code.contains("delegateEvents as"));
    assert!(!without_delegation.code.contains("$zeusDelegateEvents(["));
}

#[test]
fn collects_delegated_events_from_nested_for_show_and_fragments() {
    let source = r"import { For, Show } from '@zeus-js/zeus'
export const App = props => (
  <For each={props.items}>
    {item => (
      <Show
        when={item.visible}
        fallback={<button onFocus={props.onFocus}>fallback</button>}
      >
        <>
          <button onClick={props.onClick}>open</button>
          <input onInput={props.onInput} />
          <button onClick={props.onAlternateClick}>alternate</button>
        </>
      </Show>
    )}
  </For>
)";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "nested-events.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: true,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("bindEvent as"));
    assert!(transformed.code.contains("delegateEvents as"));
    assert_eq!(transformed.code.matches("$zeusDelegateEvents([").count(), 1);
    assert!(
        transformed
            .code
            .contains("$zeusDelegateEvents([\"click\", \"focus\", \"input\"]);")
    );
}

#[test]
fn collects_delegated_events_and_locator_names_from_dynamic_regions() {
    let source = r#"export const App = props => <div>
  {props.ok ? <button data-zeus-node="user" onClick={props.onClick}>ok</button> : null}
  {props.ready && <button onFocus={props.onFocus}>ready</button>}
  {props.items.map(item => <button onInput={props.onInput}>{item}</button>)}
  {[<button onChange={props.onChange}>changed</button>]}
</div>
"#;
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "dynamic-region-events.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: true,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(
        transformed.code.contains("data-zeus-node-0"),
        "{}",
        transformed.code
    );
    assert!(transformed.code.contains("delegateEvents as"));
    assert!(
        transformed
            .code
            .contains("$zeusDelegateEvents([\"change\", \"click\", \"focus\", \"input\"]);")
    );
}

#[test]
fn collects_locator_names_from_show_fallback_subtrees() {
    let source = r#"import { Show } from '@zeus-js/zeus'
export const App = props => <div><Show when={props.ok} fallback={<button data-zeus-node="user" onClick={props.onClick}>fallback</button>}><span>{props.name}</span></Show></div>
"#;
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "show-fallback-locator.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(
        transformed.code.contains("data-zeus-node-0"),
        "fallback attributes must reserve the locator name: {}",
        transformed.code
    );
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(directive.diagnostics.is_empty());
    assert!(
        directive
            .code
            .starts_with("#!/usr/bin/env node\n\"use client\";\nimport {")
    );
}

#[test]
fn emits_rust_hmr_boundary_for_top_level_render_roots() {
    let mut options = options(false);
    options.source = "import { render as mount } from '@zeus-js/zeus'\n\nmount('first', document.body)\nmount('second', document.body)".into();
    options.filename = "main.tsx".into();
    options.hmr = true;

    let transformed = transform_module(options);

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains("const _zeusHmrDisposers = []"));
    assert!(
        transformed
            .code
            .contains("_zeusHmrDisposers.push(mount('first'")
    );
    assert!(
        transformed
            .code
            .contains("_zeusHmrDisposers.push(mount('second'")
    );
    assert!(
        transformed
            .code
            .contains("for (const dispose of _zeusHmrDisposers.splice(0).reverse())")
    );
    let register = transformed
        .code
        .find("import.meta.hot.dispose")
        .expect("HMR disposal is registered");
    let mount = transformed
        .code
        .find("mount('first'")
        .expect("first root is mounted");
    assert!(register < mount, "disposal must be registered before mount");
    assert!(transformed.code.contains("root disposal failed"));
}

#[test]
fn skips_rust_hmr_when_module_has_an_explicit_boundary() {
    let mut options = options(false);
    options.source = "import { render } from '@zeus-js/zeus'\n\nif (import.meta.hot) import.meta.hot.accept()\nrender('view', document.body)".into();
    options.filename = "main.tsx".into();
    options.hmr = true;

    let transformed = transform_module(options);

    assert!(transformed.diagnostics.is_empty());
    assert!(!transformed.code.contains("const _dispose"));
    assert!(!transformed.code.contains("import.meta.hot.dispose"));
}

#[test]
fn wraps_destructured_render_results_without_synthetic_declarations() {
    let mut options = options(false);
    options.source = "import { render } from '@zeus-js/zeus'\n\nconst { dispose } = render('view', document.body)".into();
    options.filename = "main.tsx".into();
    options.hmr = true;

    let transformed = transform_module(options);

    assert!(transformed.diagnostics.is_empty());
    assert!(transformed.code.contains(
        "const { dispose } = (_zeusHmrDisposers.push(render('view', document.body)), _zeusHmrDisposers[_zeusHmrDisposers.length - 1])"
    ));
    assert!(!transformed.code.contains("= const _dispose"));
}

#[test]
fn emits_attribute_property_and_ref_bindings_with_stable_locators() {
    let source = r"export const App = (props, inputRef) => (
  <section title={props.title}>
    prefix
    <div className={props.className} style={props.style}>
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
    assert!(transformed.code.contains("() => (props.style)"));
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
        "props.style",
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("createComponent as"));
    assert!(transformed.code.contains("mountShow as"));
    assert!(transformed.code.contains("mountFor as"));
    assert!(transformed.code.contains("() => props.visible"));
    assert!(transformed.code.contains("() => props.items"));
    assert!(!transformed.code.contains(", Show as"));
    assert!(!transformed.code.contains(", For as"));
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
fn emits_dynamic_region_for_nested_conditional_and_array_jsx() {
    let source = r"export const App = props => <section>{props.ok ? <span>yes</span> : null}{props.items.map(item => <b>{item.name}</b>)}</section>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "nested-regions.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("mountDynamic"));
    assert!(transformed.code.contains("() => (props.ok ?"));
    assert!(transformed.code.contains("props.items ?? []).map"));
    assert!(transformed.code.contains("<b"));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &transformed.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "nested region output must parse: {:?}",
        parsed.diagnostics
    );
}

#[test]
fn emits_dynamic_region_for_explicit_function_call_children() {
    let source = r"const render = () => <span>node</span>
export const App = props => <div>{render()}</div>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "function-child.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("mountDynamic"));
    assert!(transformed.code.contains("() => render()"));
}

#[test]
fn emits_dom_and_ssr_dynamic_regions_for_array_literal_children() {
    let source = r"export const App = props => <div>{[<A />, props.value, <B />]}</div>
";
    let dom = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "array-literal-region.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });
    assert!(dom.diagnostics.is_empty(), "{:?}", dom.diagnostics);
    assert!(dom.code.contains("mountDynamic"));
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &dom.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "array literal DOM output must parse: {:?}",
        parsed.diagnostics
    );

    let ssr = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "array-literal-region.ssr.tsx".into(),
        target: TransformTarget::Ssr,
        runtime_module: "@zeus-js/runtime-ssr".into(),
        delegate_events: false,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });
    assert!(ssr.diagnostics.is_empty(), "{:?}", ssr.diagnostics);
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &ssr.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "array literal SSR output must parse: {:?}",
        parsed.diagnostics
    );
}

#[test]
fn emits_create_slot_for_web_component_slot_ir() {
    let source = r#"import { defineElement as d, Host as H, Slot as S } from '@zeus-js/runtime-dom'
export const Element = d('z-card', { shadow: false }, props => <H><section><S name="header">fallback</S></section></H>)
"#;
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "slot.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("createSlot as"));
    assert!(transformed.code.contains("$zeusCreateSlot"));
    assert!(transformed.code.contains("\"header\""));
}

#[test]
fn collects_create_slot_for_slots_in_show_fallbacks() {
    let source = r"import { defineElement as d, Host as H, Show, Slot as S } from '@zeus-js/runtime-dom'
export const Element = d('z-card', { shadow: false }, props => <H><Show when={props.ready} fallback={<S />}><span>ready</span></Show></H>)
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "slot-show-fallback.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("createSlot as"));
}

#[test]
fn emits_show_and_for_mounts_with_stable_region_markers() {
    let source = r#"import { Show, For } from '@zeus-js/zeus'
export const App = props => <div><Show when={props.visible} fallback="hidden"><span>{props.name}</span></Show><For each={props.items} by={item => item.id}>{(item, index) => <b data-index={index}>{item.label}</b>}</For></div>
"#;
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "control-flow.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
    assert!(transformed.code.contains("($zeusItem, $zeusIndex) =>"));
    assert!(transformed.code.contains("$zeusItem()"));
    assert!(transformed.code.contains("$zeusIndex()"));
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
fn subscribes_only_to_referenced_for_accessors() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <div><For each={props.items} by={item => item.id}>{(item, index) => <b title={item.label}>fixed</b>}</For></div>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "for-accessor-dependencies.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("$zeusItem()"));
    assert!(
        !transformed.code.contains("$zeusIndex()"),
        "unused index accessor must not become a binding dependency: {}",
        transformed.code
    );
}

#[test]
fn subscribes_to_unicode_escaped_for_parameters_and_references() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <For each={props.items}>{(it\u0065m, ind\u0065x) => <b data-index={ind\u0065x}>{it\u0065m.label}</b>}</For>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "for-unicode-accessors.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.map.is_some(), "source map must be preserved");
    assert!(
        transformed.code.contains("$zeusItem()"),
        "escaped item reference must subscribe to its accessor: {}",
        transformed.code
    );
    assert!(
        transformed.code.contains("$zeusIndex()"),
        "escaped index reference must subscribe to its accessor: {}",
        transformed.code
    );
}

#[test]
fn ignores_non_references_and_shadowed_names_in_for_expressions() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <For each={props.items}>{(item, index) => (
  <button
    data-item={props.record.item}
    title={({ item: 'item', index: 'index' }).item /* item index */}
    onClick={() => ((item, index) => item.run(index))(props.local, 0)}
  >fixed</button>
)}</For>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "for-shadowed-accessors.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.map.is_some(), "source map must be preserved");
    assert!(
        !transformed.code.contains("$zeusItem()"),
        "non-references and shadowed item names must not subscribe: {}",
        transformed.code
    );
    assert!(
        !transformed.code.contains("$zeusIndex()"),
        "non-references and shadowed index names must not subscribe: {}",
        transformed.code
    );
}

#[test]
fn nested_for_key_callback_does_not_capture_the_outer_item_accessor() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <For each={props.groups}>{item => (
  <For each={item.rows} by={item => item.id}>{row => <b>{row.label}</b>}</For>
)}</For>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "nested-for-key-scope.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("item => item.id"));
    assert_eq!(
        transformed.code.matches("$zeusItem()").count(),
        1,
        "only the nested each expression may read the outer item accessor: {}",
        transformed.code
    );
}

#[test]
fn subscribes_when_a_for_item_is_used_as_a_component_callee() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <For each={props.components}>{Item => <Item />}</For>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "for-component-callee.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("$zeusItem()"));
}

#[test]
fn does_not_subscribe_to_type_only_for_parameter_references() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <For each={props.items}>{(item, index) => <span title={(props.calls++, props.value as typeof index)}>{item.label}</span>}</For>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "for-type-only-reference.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(
        transformed.diagnostics.is_empty(),
        "{:?}",
        transformed.diagnostics
    );
    assert!(transformed.code.contains("$zeusItem()"));
    assert!(
        !transformed.code.contains("$zeusIndex()"),
        "type-only index reference must not subscribe: {}",
        transformed.code
    );
}

#[test]
fn rejects_non_identifier_for_callback_parameters_before_codegen() {
    let source = r"import { For } from '@zeus-js/zeus'
export const App = props => <For each={props.items}>{({ label }, index) => <b>{index}:{label}</b>}</For>
";
    let transformed = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "for-destructured-parameter.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(transformed.code.is_empty());
    assert_eq!(transformed.map, None);
    assert_eq!(transformed.diagnostics.len(), 1);
    assert_eq!(
        transformed.diagnostics[0].code,
        "ZEUS_UNSUPPORTED_FOR_CALLBACK_PARAMETER"
    );
}

#[test]
fn emits_ssr_native_component_and_control_flow_calls() {
    let source = r#"import { Show } from '@zeus-js/zeus'
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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
fn emits_stable_hydration_plan_and_ssr_markers_for_dom_and_ssr_targets() {
    let source = r"import { Show } from '@zeus-js/zeus'
export const App = props => <main title={props.title}>
  <Show when={props.visible} fallback=<i>off</i>>
    <button onClick={props.onClick}>{props.label}</button>
  </Show>
</main>
";
    let dom = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "hydration-plan.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: false,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });
    let ssr = transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "hydration-plan.tsx".into(),
        target: TransformTarget::Ssr,
        runtime_module: "@zeus-js/runtime-ssr".into(),
        delegate_events: false,
        source_map: false,
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
    });

    assert!(dom.diagnostics.is_empty(), "{:?}", dom.diagnostics);
    assert!(ssr.diagnostics.is_empty(), "{:?}", ssr.diagnostics);
    assert_eq!(dom.hydration_plan, ssr.hydration_plan);
    let plan = dom
        .hydration_plan
        .expect("JSX modules require a hydration plan");
    assert_eq!(plan.version, 1);
    assert_eq!(plan.components.len(), 1);
    let component = &plan.components[0];
    assert!(
        std::path::Path::new(&component.template_id)
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("root"))
    );
    assert!(component.nodes.iter().any(|node| {
        node.kind == "element"
            && node.tag_name.as_deref() == Some("main")
            && node.bindings.iter().any(|binding| binding.kind == "attr")
    }));
    assert!(component.nodes.iter().any(|node| {
        node.kind == "text" && node.bindings.iter().any(|binding| binding.kind == "text")
    }));
    assert!(component.nodes.iter().any(|node| node.kind == "show"));
    assert!(component.nodes.iter().any(|node| {
        node.kind == "element"
            && node.tag_name.as_deref() == Some("button")
            && node.bindings.iter().any(|binding| binding.kind == "event")
    }));
    for node in &component.nodes {
        assert!(
            ssr.code.contains(&node.id),
            "SSR output is missing hydration marker {}: {}",
            node.id,
            ssr.code
        );
    }
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
        hmr: false,
        pure_define_element: PureDefineElementMode::Disabled,
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

#[test]
fn preserves_function_property_values_without_invoking_them() {
    let mut input = options(false);
    input.source = "export const App = () => <z-grid prop:formatter={(row) => row.name} />".into();
    let result = transform_module(input);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert!(
        result.code.contains("() => ((row) => row.name)"),
        "{}",
        result.code
    );
    assert!(!result.code.contains("row.name)()"));
}

#[test]
fn emits_once_intrinsic_as_an_initialization_binding_without_runtime_wrapper() {
    let mut input = options(false);
    input.source =
        "export const App = props => <div title={once(props.title)}>{once(props.label)}</div>"
            .into();
    let result = transform_module(input);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert!(
        result.code.contains("() => (props.title), true"),
        "{}",
        result.code
    );
    assert!(
        result.code.contains("() => (props.label), true"),
        "{}",
        result.code
    );
    assert!(!result.code.contains("once(props"), "{}", result.code);
    assert_eq!(
        result.code.matches("bindText").count(),
        1,
        "{}",
        result.code
    );
}

#[test]
fn reuses_identical_static_templates_across_components() {
    let mut input = options(false);
    input.source = "export const First = () => <div class=\"fixed\">content</div>; export const Second = () => <div class=\"fixed\">content</div>".into();
    let result = transform_module(input);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert_eq!(
        result.code.matches("$zeusTemplate(\"").count(),
        1,
        "{}",
        result.code
    );
    assert!(
        result.code.matches("$zeusTmpl").count() >= 2,
        "{}",
        result.code
    );
}

#[test]
fn lowers_ordered_native_and_component_spreads_for_both_targets() {
    for target in [TransformTarget::Dom, TransformTarget::Ssr] {
        let mut input = options(true);
        input.target = target;
        input.source = "const View = props => <div {...base()} id=\"fixed\" {...later()} />; export const App = () => <View {...base()} value={count()} />".into();
        let result = transform_module(input);
        assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
        assert!(result.code.contains("mergeProps"), "{}", result.code);
        assert!(
            result.code.contains(if target == TransformTarget::Dom {
                "bindSpread"
            } else {
                "ssrSpread"
            }),
            "{}",
            result.code
        );
        assert!(result.code.contains("base()"));
        assert!(result.code.contains("later()"));
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, &result.code, SourceType::ts()).parse();
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    }
}

#[test]
fn emits_transition_mount_for_dom_and_static_branch_for_ssr() {
    let source = "import { Transition } from '@zeus-js/zeus'; export const App = props => <Transition when={props.open} enter=\"fade-in\" duration={120}><span>{props.label}</span></Transition>";
    let mut dom = options(false);
    dom.source = source.into();
    let result = transform_module(dom);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert!(result.code.contains("mountTransition"), "{}", result.code);
    assert!(result.code.contains("props.open"), "{}", result.code);
    assert!(
        result.code.contains("enter: \"fade-in\""),
        "{}",
        result.code
    );
    assert!(result.code.contains("duration: 120"), "{}", result.code);
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &result.code, SourceType::ts()).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "{:?}\n{}",
        parsed.diagnostics,
        result.code
    );

    let mut ssr = options(false);
    ssr.target = TransformTarget::Ssr;
    ssr.source = source.into();
    let result = transform_module(ssr);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert!(!result.code.contains("mountTransition"), "{}", result.code);
    assert!(result.code.contains("props.open ?"), "{}", result.code);
}
