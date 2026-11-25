//! Byte-exact golden fixtures for the compiler's observable output.
//!
//! The compiler is a pure function of `(source, options)`: it returns generated
//! code, a source map, diagnostics, a hydration plan and an HMR plan. That makes
//! the whole of its externally visible behaviour snapshotable, which is what
//! makes a large internal refactor verifiable rather than hopeful.
//!
//! These fixtures are the safety net for splitting `lower.rs` and `codegen.rs`.
//! A refactor that changes generated code, a diagnostic's position, a source map
//! mapping or the hydration plan fails here, with a diff naming the exact field.
//!
//! Regenerating is deliberate, never automatic:
//!
//! ```text
//! ZEUS_UPDATE_GOLDEN=1 cargo test -p zeus_compiler --test golden
//! ```
//!
//! Every regeneration must be explained in the commit. A snapshot refreshed to
//! make a refactor pass proves nothing.

use std::fs;
use std::path::Path;

use serde::Serialize;
use zeus_compiler::diagnostic::CompilerDiagnostic;
use zeus_compiler::{RawSourceMap, TransformModuleOptions, TransformTarget, transform_module};

/// One compiler invocation and the complete result it must keep producing.
#[derive(Debug, Serialize)]
struct GoldenCase {
    /// Why this case exists — the behaviour it pins.
    purpose: &'static str,
    source: &'static str,
    filename: &'static str,
    options: GoldenOptions,
    /// The compiler output. `None` only while regenerating.
    #[serde(skip_serializing_if = "Option::is_none")]
    expected: Option<GoldenOutput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
// These mirror `TransformModuleOptions`, whose switches are independent rather
// than mutually exclusive — the same reason that type carries the allow.
#[allow(clippy::struct_excessive_bools)]
struct GoldenOptions {
    target: &'static str,
    runtime_module: &'static str,
    delegate_events: bool,
    source_map: bool,
    hmr: bool,
    pure_define_element: bool,
    auto_hydrate: bool,
}

impl GoldenOptions {
    fn to_compiler(&self, source: &str, filename: &str) -> TransformModuleOptions {
        TransformModuleOptions {
            source: source.to_string(),
            filename: filename.to_string(),
            target: match self.target {
                "ssr" => TransformTarget::Ssr,
                _ => TransformTarget::Dom,
            },
            runtime_module: self.runtime_module.to_string(),
            delegate_events: self.delegate_events,
            source_map: self.source_map,
            hmr: self.hmr,
            pure_define_element: self.pure_define_element.into(),
            auto_hydrate: self.auto_hydrate,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GoldenOutput {
    code: String,
    map: Option<RawSourceMap>,
    diagnostics: Vec<CompilerDiagnostic>,
    hydration_plan: Option<serde_json::Value>,
    hmr_plan: Option<serde_json::Value>,
}

fn dom() -> GoldenOptions {
    GoldenOptions {
        target: "dom",
        runtime_module: "zeus",
        delegate_events: true,
        source_map: true,
        hmr: false,
        pure_define_element: false,
        auto_hydrate: false,
    }
}

fn ssr() -> GoldenOptions {
    GoldenOptions {
        target: "ssr",
        runtime_module: "zeus/server",
        delegate_events: false,
        source_map: true,
        hmr: false,
        pure_define_element: false,
        auto_hydrate: false,
    }
}

/// Every case the refactor must preserve, grouped by the behaviour it pins so a
/// failure points at the part of the pipeline that moved.
#[allow(clippy::too_many_lines)]
fn cases() -> Vec<GoldenCase> {
    let mut cases = Vec::new();

    macro_rules! golden {
        ($purpose:expr, $filename:expr, $options:expr, $source:expr) => {
            cases.push(GoldenCase {
                purpose: $purpose,
                source: $source,
                filename: $filename,
                options: $options,
                expected: None,
            });
        };
    }

    // ---- Static templates and text bindings -----------------------------
    golden!(
        "static element becomes a cached template with no bindings",
        "static.tsx",
        dom(),
        "export function App() {\n  return <div class=\"card\"><h1>Hello</h1><p>World</p></div>\n}\n"
    );
    golden!(
        "dynamic text binds to a single text node",
        "text.tsx",
        dom(),
        "export function App(props) {\n  return <p>count: {props.count}</p>\n}\n"
    );
    golden!(
        "multiple dynamic texts in one element",
        "multi-text.tsx",
        dom(),
        "export function App(props) {\n  return <p>{props.a} and {props.b} and {props.c}</p>\n}\n"
    );
    golden!(
        "nested elements keep their DOM path stable",
        "nested.tsx",
        dom(),
        "export function App(props) {\n  return <div><section><article><span>{props.value}</span></article></section></div>\n}\n"
    );

    // ---- Attribute / property / class / style ---------------------------
    golden!(
        "dynamic attribute updates only the attribute",
        "attr.tsx",
        dom(),
        "export function App(props) {\n  return <input title={props.title} />\n}\n"
    );
    golden!(
        "DOM property binding uses the property path",
        "prop.tsx",
        dom(),
        "export function App(props) {\n  return <input value={props.value} />\n}\n"
    );
    golden!(
        "class and style bindings",
        "class-style.tsx",
        dom(),
        "export function App(props) {\n  return <div class={props.cls} style={{ color: props.color }} />\n}\n"
    );
    golden!(
        "spread attributes are collected as one source",
        "spread.tsx",
        dom(),
        "export function App(props) {\n  return <div {...props.attrs} id=\"x\" />\n}\n"
    );

    // ---- Events ---------------------------------------------------------
    golden!(
        "delegated click handler",
        "event.tsx",
        dom(),
        "export function App(props) {\n  return <button onClick={props.onClick}>go</button>\n}\n"
    );
    golden!(
        "non-delegatable event binds directly",
        "event-non-delegated.tsx",
        dom(),
        "export function App(props) {\n  return <video onPlay={props.onPlay} />\n}\n"
    );
    golden!(
        "delegation disabled binds every handler directly",
        "event-no-delegation.tsx",
        GoldenOptions {
            delegate_events: false,
            ..dom()
        },
        "export function App(props) {\n  return <button onClick={props.onClick}>go</button>\n}\n"
    );

    // ---- Ref ------------------------------------------------------------
    golden!(
        "ref binding",
        "ref.tsx",
        dom(),
        "export function App(props) {\n  return <input ref={props.inputRef} />\n}\n"
    );

    // ---- Components -----------------------------------------------------
    golden!(
        "component with props and children",
        "component.tsx",
        dom(),
        "export function App() {\n  return <Card title=\"t\"><span>child</span></Card>\n}\n"
    );
    golden!(
        "component with dynamic prop",
        "component-dynamic.tsx",
        dom(),
        "export function App(props) {\n  return <Card count={props.count} />\n}\n"
    );

    // ---- Control flow ---------------------------------------------------
    //
    // Every fixture in this section imports the builtin it uses. Without the
    // import the element is not recognised as a builtin at all: it takes the
    // ordinary-component path, its JSX-valued `fallback` prop is rejected as
    // `ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE`, and the module emits no code.
    // That is what these six fixtures used to do — they were named for control
    // flow and snapshotting a rejection instead. `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION`
    // (For), `ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE` (Show, ErrorBoundary) and
    // a silently-accepted `name` attribute (Transition) were the tell.
    //
    // The rejections are still covered: `tests/diagnostics.rs` builds each of
    // them deliberately, and the misnamed-builtin shape is pinned by
    // `an_unimported_builtin_is_treated_as_a_component`.
    golden!(
        "Show with a JSX fallback",
        "show.tsx",
        dom(),
        "import { Show } from '@zeus-js/runtime-dom'\nexport function App(props) {\n  return <Show when={props.open} fallback={<p>closed</p>}><p>open</p></Show>\n}\n"
    );
    golden!(
        "For with accessor",
        "for.tsx",
        dom(),
        "import { For } from '@zeus-js/runtime-dom'\nexport function App(props) {\n  return <For each={props.items}>{item => <li>{item.name}</li>}</For>\n}\n"
    );
    golden!(
        "For with index accessor",
        "for-index.tsx",
        dom(),
        "import { For } from '@zeus-js/runtime-dom'\nexport function App(props) {\n  return <For each={props.items}>{(item, index) => <li>{index()}: {item.name}</li>}</For>\n}\n"
    );
    golden!(
        "nested Show inside For",
        "show-in-for.tsx",
        dom(),
        "import { For, Show } from '@zeus-js/runtime-dom'\nexport function App(props) {\n  return <For each={props.items}>{item => <Show when={item.visible}>{item.name}</Show>}</For>\n}\n"
    );
    golden!(
        "ErrorBoundary with a render fallback",
        "error-boundary.tsx",
        dom(),
        "import { ErrorBoundary } from '@zeus-js/runtime-dom'\nexport function App() {\n  return <ErrorBoundary fallback={err => <p>{err.message}</p>}><Child /></ErrorBoundary>\n}\n"
    );
    golden!(
        "Transition driven by an inline style pair",
        "transition.tsx",
        dom(),
        "import { Transition } from '@zeus-js/runtime-dom'\nexport function App(props) {\n  return <Transition when={props.visible} enter={{ opacity: '1' }} leave={{ opacity: '0' }}><p>x</p></Transition>\n}\n"
    );

    // ---- Fragments and SVG ----------------------------------------------
    golden!(
        "fragment lowers to adjacent children",
        "fragment.tsx",
        dom(),
        "export function App(props) {\n  return <><span>{props.a}</span><span>{props.b}</span></>\n}\n"
    );
    golden!(
        "SVG keeps namespaced attributes",
        "svg.tsx",
        dom(),
        "export function App(props) {\n  return <svg viewBox=\"0 0 10 10\"><path d={props.d} /></svg>\n}\n"
    );

    // ---- Raw text -------------------------------------------------------
    golden!(
        "raw text element with dynamic content",
        "raw-text.tsx",
        dom(),
        "export function App(props) {\n  return <div innerHTML={props.html} />\n}\n"
    );

    // ---- Dynamic regions ------------------------------------------------
    golden!(
        "expression child becomes a dynamic region",
        "region.tsx",
        dom(),
        "export function App(props) {\n  return <div>{props.render()}</div>\n}\n"
    );
    golden!(
        "conditional expression child",
        "region-ternary.tsx",
        dom(),
        "export function App(props) {\n  return <div>{props.open ? <b>y</b> : <i>n</i>}</div>\n}\n"
    );
    golden!(
        "array map expression child",
        "region-map.tsx",
        dom(),
        "export function App(props) {\n  return <ul>{props.items.map(item => <li>{item}</li>)}</ul>\n}\n"
    );

    // ---- Pure defineElement ---------------------------------------------
    golden!(
        "defineElement with pure mode",
        "define-element.tsx",
        GoldenOptions {
            pure_define_element: true,
            ..dom()
        },
        "const Card = defineElement('z-x', { props: { n: Number } }, props => <Host><Slot name=\"heading\">fallback</Slot><span>{props.n}</span></Host>)\n"
    );

    // ---- HMR ------------------------------------------------------------
    /*
     * `collect_render_names` records a render call under three conditions, all
     * of them required: the module imports the name (a free `render(...)` is
     * invisible), the import comes from `@zeus-js/runtime-dom` or
     * `@zeus-js/zeus` (the source string is compared literally, so a bare
     * `'zeus'` does not count), and an expression parses as a string literal.
     *
     * The fixture below meets all three. The earlier version met none: it
     * declared no import at all, so the plan was None and the case compared
     * null to null while being named for the plan it never produced.
     *
     * The literal is written `class={'contract'}` rather than `class="contract"`
     * for the same reason: only an expression the pass can parse as a string
     * literal becomes a slot, and a bare JSX attribute lowers to a Static
     * attribute that never reaches the rewrite.
     */
    golden!(
        "HMR plan for an imported render call with a maskable literal",
        "hmr.tsx",
        GoldenOptions { hmr: true, ..dom() },
        "import { render } from '@zeus-js/runtime-dom'\nexport function App(props) {\n  return <p class={'contract'}>{props.value}</p>\n}\nrender(App, document.body)\n"
    );
    golden!(
        "HMR plan is absent when nothing is maskable",
        "hmr-no-literals.tsx",
        GoldenOptions { hmr: true, ..dom() },
        "import { render } from '@zeus-js/runtime-dom'\nexport function App(props) {\n  return <p>{props.value}</p>\n}\nrender(App, document.body)\n"
    );
    golden!(
        "HMR is skipped when a manual boundary exists",
        "hmr-manual.tsx",
        GoldenOptions { hmr: true, ..dom() },
        "export function App(props) {\n  return <p>{props.value}</p>\n}\nif (import.meta.hot) { import.meta.hot.accept() }\nrender(App, document.body)\n"
    );

    // ---- Auto hydration -------------------------------------------------
    golden!(
        "auto hydration emits an adoption body",
        "auto-hydrate.tsx",
        GoldenOptions {
            auto_hydrate: true,
            ..dom()
        },
        "export function App(props) {\n  return <div><span>{props.value}</span></div>\n}\n"
    );

    // ---- SSR ------------------------------------------------------------
    golden!(
        "SSR renders a component to a string",
        "ssr-basic.tsx",
        ssr(),
        "export function App(props) {\n  return <div class={props.cls}><span>{props.text}</span></div>\n}\n"
    );
    golden!(
        "SSR escapes text and attribute values",
        "ssr-escape.tsx",
        ssr(),
        "export function App(props) {\n  return <div title={props.t}><span>{props.text}</span></div>\n}\n"
    );
    golden!(
        "SSR void elements close without a closing tag",
        "ssr-void.tsx",
        ssr(),
        "export function App() {\n  return <div><br /><img src=\"x\" /></div>\n}\n"
    );
    golden!(
        "SSR Show and For",
        "ssr-flow.tsx",
        ssr(),
        "import { Show, For } from '@zeus-js/runtime-dom'\nexport function App(props) {\n  return <div><Show when={props.open}><b>y</b></Show><For each={props.items}>{i => <i>{i}</i>}</For></div>\n}\n"
    );
    // The fallback is a render function, not a JSX value. A JSX `fallback`
    // would be rejected as a component prop before the SSR target ever sees the
    // boundary, which is what this fixture used to snapshot — under a name that
    // claimed to cover SSR. With the fallback valid, the only diagnostic is the
    // one the fixture is named for. `tests/diagnostics.rs` keeps the invalid
    // fallback covered on its own terms.
    golden!(
        "ErrorBoundary is rejected by SSR, not by its fallback",
        "ssr-error-boundary.tsx",
        ssr(),
        "import { ErrorBoundary } from '@zeus-js/runtime-dom'\nexport function App() {\n  return <ErrorBoundary fallback={err => <p>{err.message}</p>}><Child /></ErrorBoundary>\n}\n"
    );
    golden!(
        "SSR rejects a property with no HTML equivalent",
        "ssr-bad-prop.tsx",
        ssr(),
        "export function App(props) {\n  return <input value={props.v} />\n}\n"
    );

    // ---- Non-JSX and pass-through ---------------------------------------
    golden!(
        "a module with no JSX is returned untouched",
        "plain.ts",
        dom(),
        "export const answer = 42\nexport function double(n) { return n * 2 }\n"
    );
    golden!(
        "a module with JSX but no component renders nothing",
        "no-component.tsx",
        dom(),
        "export const node = <div>static</div>\n"
    );

    // ---- Diagnostics ----------------------------------------------------
    golden!(
        "an unsupported source type is reported, not guessed",
        "module.css",
        dom(),
        ".a { color: red }\n"
    );
    golden!(
        "input nesting beyond the limit becomes a diagnostic",
        "deep.tsx",
        dom(),
        "export function App() {\n  return <div>{1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1}</div>\n}\n"
    );
    golden!(
        "async components are rejected with a hint",
        "async.tsx",
        dom(),
        "export async function App() {\n  return <div>async</div>\n}\n"
    );

    // ---- Source map specifics -------------------------------------------
    golden!(
        "source map is absent when not requested",
        "no-map.tsx",
        GoldenOptions {
            source_map: false,
            ..dom()
        },
        "export function App(props) {\n  return <p>{props.count}</p>\n}\n"
    );
    golden!(
        "unicode and multiline expressions map correctly",
        "unicode.tsx",
        dom(),
        "export function App(props) {\n  return <p title=\"中文\">\n    {props.value +\n      props.other}\n  </p>\n}\n"
    );

    // ---- TypeScript / plain JS ------------------------------------------
    golden!(
        "TypeScript types are erased from the output",
        "types.tsx",
        dom(),
        "interface Props { count: number }\nexport function App(props: Props) {\n  return <p>{props.count}</p>\n}\n"
    );
    golden!(
        "plain JS with JSX compiles like TSX",
        "plain.jsx",
        dom(),
        "export function App(props) {\n  return <p>{props.count}</p>\n}\n"
    );

    cases
}

/// Serialize the full compiler result for one case.
fn run(case: &GoldenCase) -> GoldenOutput {
    let options = case.options.to_compiler(case.source, case.filename);
    let result = transform_module(options);
    GoldenOutput {
        code: result.code,
        map: result.map,
        diagnostics: result.diagnostics,
        hydration_plan: result
            .hydration_plan
            .as_ref()
            .and_then(|plan| serde_json::to_value(plan).ok()),
        hmr_plan: result
            .hmr_plan
            .as_ref()
            .and_then(|plan| serde_json::to_value(plan).ok()),
    }
}

fn fixture_dir() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden")
}

fn sanitize(filename: &str) -> String {
    filename.replace(['/', '.'], "-")
}

/// Which output field moved. Naming the field turns a wall of JSON into a
/// one-line failure a reviewer can act on.
fn changed_field(expected: &serde_json::Value, actual: &serde_json::Value) -> &'static str {
    if expected.pointer("/expected/code") != actual.pointer("/expected/code") {
        return "code";
    }
    if expected.pointer("/expected/map") != actual.pointer("/expected/map") {
        return "map";
    }
    if expected.pointer("/expected/diagnostics") != actual.pointer("/expected/diagnostics") {
        return "diagnostics";
    }
    if expected.pointer("/expected/hydrationPlan") != actual.pointer("/expected/hydrationPlan") {
        return "hydrationPlan";
    }
    if expected.pointer("/expected/hmrPlan") != actual.pointer("/expected/hmrPlan") {
        return "hmrPlan";
    }
    "unknown"
}

fn side(document: &serde_json::Value, field: &str) -> String {
    match field {
        "code" => document
            .pointer("/expected/code")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        "map" | "diagnostics" => document
            .pointer(&format!("/expected/{field}"))
            .map(ToString::to_string)
            .unwrap_or_default(),
        _ => document
            .pointer("/expected")
            .map(ToString::to_string)
            .unwrap_or_default(),
    }
}

fn compare_fixture(filename: &str, purpose: &str, serialized: &str, dir: &Path) -> Option<String> {
    let path = dir.join(format!("{}.json", sanitize(filename)));
    let Ok(existing) = fs::read_to_string(&path) else {
        return Some(format!(
            "{filename}: no fixture; run ZEUS_UPDATE_GOLDEN=1 to create it"
        ));
    };

    // Compare parsed JSON, not text, so a formatter change does not fail a
    // refactor while a real behaviour change always does.
    let expected: serde_json::Value =
        serde_json::from_str(&existing).expect("fixture is valid JSON");
    let actual: serde_json::Value = serde_json::from_str(serialized).expect("valid JSON");
    if expected == actual {
        return None;
    }

    let field = changed_field(&expected, &actual);
    Some(format!(
        "{} ({}): {field} changed\n--- expected ---\n{}\n--- actual ---\n{}",
        filename,
        purpose,
        side(&expected, field),
        side(&actual, field),
    ))
}

#[test]
fn golden_output_is_unchanged() {
    let update = std::env::var("ZEUS_UPDATE_GOLDEN").is_ok();
    let dir = fixture_dir();
    if update {
        fs::create_dir_all(&dir).expect("create golden directory");
    }

    let mut failures = Vec::new();
    let mut written = 0;

    for case in cases() {
        let output = run(&case);
        let produced_hmr_plan = output.hmr_plan.is_some();
        let document = GoldenCase {
            purpose: case.purpose,
            source: case.source,
            filename: case.filename,
            options: case.options,
            expected: Some(output),
        };
        let serialized = serde_json::to_string_pretty(&document).expect("serialize golden case");

        if update {
            let path = dir.join(format!("{}.json", sanitize(case.filename)));
            fs::write(&path, format!("{serialized}\n")).expect("write golden fixture");
            written += 1;
            continue;
        }

        /*
         * A fixture named `hmr*` that records `"hmrPlan": null` asserts only
         * that two nulls are equal. That is how this suite reported an HMR
         * golden as passing for as long as every plan was null: the case was
         * named for the plan, the comparison was `null == null`, and nothing
         * asked whether a plan had been produced at all.
         */
        /*
         * Both exemptions are cases where a null plan is the correct answer and
         * the fixture therefore asserts nothing: a module with no maskable
         * literal, and one that declares its own `import.meta.hot` boundary so
         * the compiler must not synthesise one.
         */
        let expects_plan = case.filename.starts_with("hmr")
            && !case.filename.contains("no-literals")
            && !case.filename.contains("manual");

        if expects_plan && !produced_hmr_plan {
            failures.push(format!(
                "{} ({}): an HMR fixture produced no hmrPlan; a null plan proves nothing",
                case.filename, case.purpose,
            ));
        }

        failures.extend(compare_fixture(
            case.filename,
            case.purpose,
            &serialized,
            &dir,
        ));
    }

    if update {
        println!("wrote {written} golden fixture(s) to {}", dir.display());
        return;
    }

    assert!(
        failures.is_empty(),
        "{} golden case(s) changed:\n\n{}\n\nA changed fixture means the compiler's observable \
         output moved. If the change is intended, regenerate with ZEUS_UPDATE_GOLDEN=1 and \
         explain it in the commit.",
        failures.len(),
        failures.join("\n\n")
    );
}

/// The fixture set is the refactor's safety net; a shrinking set is a quieter
/// failure than a wrong one, so the count is pinned here.
#[test]
fn golden_fixture_set_is_complete() {
    assert_eq!(
        cases().len(),
        46,
        "the golden set must keep covering every pipeline behaviour; add a case rather than remove one"
    );
}
