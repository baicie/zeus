use zeus_compiler::{
    PureDefineElementMode, TransformModuleOptions, TransformModuleResult, TransformTarget,
    transform_module,
};

fn compile(source: &str) -> TransformModuleResult {
    transform_module(TransformModuleOptions {
        source: source.into(),
        filename: "/src/main.tsx".into(),
        target: TransformTarget::Dom,
        runtime_module: "@zeus-js/runtime-dom".into(),
        delegate_events: true,
        source_map: true,
        hmr: true,
        pure_define_element: PureDefineElementMode::Disabled,
        auto_hydrate: false,
    })
}

const SOURCE: &str = r#"import { render, createSignal, For, Show } from '@zeus-js/zeus';
const [count, setCount] = createSignal(0);
render(() => <main class={'old'} style={"color: red"}>
  <button onClick={() => setCount(count() + 1)}>{'Hello'} {count()}</button>
  <Show when={count()}><p>{'Conditional'}</p></Show>
  <For each={[1, 2]}>{item => <span>{'Row'} {item}</span>}</For>
</main>, document.body);
"#;

#[test]
fn literal_binding_edits_keep_the_compiler_signature() {
    let before = compile(SOURCE);
    let after = compile(
        &SOURCE
            .replace("'old'", "'new class'")
            .replace("color: red", "color: blue")
            .replace("'Hello'", "'Bonjour'"),
    );
    assert!(before.diagnostics.is_empty());
    assert!(after.diagnostics.is_empty());
    let before = before.hmr_plan.unwrap();
    let after = after.hmr_plan.unwrap();
    assert_eq!(before.signature, after.signature);
    assert_eq!(before.bindings.len(), 5);
    assert_eq!(
        before
            .bindings
            .iter()
            .map(|binding| binding.id)
            .collect::<Vec<_>>(),
        after
            .bindings
            .iter()
            .map(|binding| binding.id)
            .collect::<Vec<_>>()
    );
    assert_ne!(before.bindings, after.bindings);
}

#[test]
fn module_semantics_and_binding_schema_are_part_of_the_signature() {
    let before = compile(SOURCE).hmr_plan.unwrap();
    for changed in [
        SOURCE.replace("createSignal(0)", "createSignal(1)"),
        SOURCE.replace("count() + 1", "count() + 2"),
        SOURCE.replace("<button", "<button disabled"),
        SOURCE.replace("'Hello'", "count()"),
        SOURCE.replace("const [count", "console.log('side effect'); const [count"),
        SOURCE.replace("from '@zeus-js/zeus'", "from 'custom-runtime'"),
    ] {
        assert!(
            compile(&changed)
                .hmr_plan
                .is_none_or(|next| next.signature != before.signature),
            "must remount: {changed}"
        );
    }
}

#[test]
fn unsupported_targets_are_not_patch_slots() {
    for view in [
        "<div class={once('old')}>{once('old')}</div>",
        "<div {...props} class={'old'} />",
        "<z-card class={'old'}>{'old'}</z-card>",
        "<textarea>{'old'}</textarea>",
        "<style>{'old'}</style>",
        "<div title={'old'} prop:value={'old'} />",
        "<div class={`old`} />",
        r"<p>{'\uD800'}</p>",
    ] {
        let source = format!(
            "import {{ render, once }} from '@zeus-js/zeus'; const props = {{}}; render(() => {view}, document.body);"
        );
        let result = compile(&source);
        assert!(
            result.diagnostics.is_empty(),
            "valid source: {view}: {:?}",
            result.diagnostics
        );
        assert!(result.hmr_plan.is_none(), "unsupported slot: {view}");
    }
}

#[test]
fn manual_component_only_production_and_ssr_do_not_install_patch_state() {
    for source in [
        "export const App = () => <p>{'Hello'}</p>",
        "import { render } from '@zeus-js/zeus'; render(() => <p>{'Hello'}</p>, document.body); import.meta.hot.accept();",
        "import { defineElement, Host, Slot, render } from '@zeus-js/zeus'; defineElement('z-card', { shadow: false }, () => <Host><p class={'old'}>{'old'}</p><Slot /></Host>); render(() => <z-card />, document.body);",
    ] {
        assert!(compile(source).hmr_plan.is_none());
    }
    for (hmr, target) in [(false, TransformTarget::Dom), (true, TransformTarget::Ssr)] {
        let result = transform_module(TransformModuleOptions {
            source: SOURCE.into(),
            filename: "/src/main.tsx".into(),
            target,
            runtime_module: "@zeus-js/runtime-dom".into(),
            delegate_events: true,
            source_map: true,
            hmr,
            pure_define_element: PureDefineElementMode::Disabled,
            auto_hydrate: false,
        });
        assert!(result.hmr_plan.is_none());
        assert!(!result.code.contains("createHmrState"));
    }
    assert!(compile(SOURCE).code.contains("createHmrState"));
}

#[test]
fn statement_wrapper_does_not_continue_a_previous_expression() {
    let result = compile(
        r"import { render } from '@zeus-js/zeus'
import { createRouter } from '@zeus-js/router'
const router = createRouter({
  routes: [],
})
render(() => <p>{router.state}</p>, document.body)
",
    );

    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert!(
        result.code.contains("})\n;(_zeusHmrDisposers.push(render("),
        "HMR wrapper must start a new statement after an ASI-terminated declaration:\n{}",
        result.code
    );
}
