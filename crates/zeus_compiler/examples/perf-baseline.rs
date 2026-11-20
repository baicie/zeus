//! Compiler throughput baseline.
//!
//! Measures the whole pipeline on inputs that stress different stages, so a
//! refactor that slows down one stage shows up as a change in the shape of the
//! numbers, not just a single average. Timings are wall-clock over repeated
//! runs with the median reported, which is what makes them comparable across
//! machines: an absolute number is machine-specific, a before/after ratio on
//! the same machine is not.

use std::time::Instant;

use zeus_compiler::{TransformModuleOptions, TransformTarget, transform_module};

fn options(source: &str, filename: &str, target: TransformTarget) -> TransformModuleOptions {
    TransformModuleOptions {
        source: source.to_string(),
        filename: filename.to_string(),
        target,
        runtime_module: "zeus".to_string(),
        delegate_events: true,
        source_map: true,
        hmr: false,
        pure_define_element: false.into(),
        auto_hydrate: false,
    }
}

fn median(mut samples: Vec<f64>) -> f64 {
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    samples[samples.len() / 2]
}

fn measure(label: &str, source: &str, filename: &str, target: TransformTarget, runs: usize) {
    // Warm up so the first-allocation cost does not land in the median.
    for _ in 0..3 {
        let _ = transform_module(options(source, filename, target));
    }
    let mut samples = Vec::with_capacity(runs);
    for _ in 0..runs {
        let start = Instant::now();
        let _ = transform_module(options(source, filename, target));
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    println!("{label:<34} {:>8.3} ms", median(samples));
}

fn main() {
    let runs = 50;

    let small = "export function App(p) { return <p>{p.n}</p> }\n";

    let medium = r#"
export function App(props) {
  return (
    <div class="card" title={props.title} {...props.attrs}>
      <header><h1>{props.heading}</h1><span class={props.badge}>badge</span></header>
      <For each={props.items}>{item => <li onClick={props.onPick}>{item.name}</li>}</For>
      <Show when={props.open} fallback={<p>closed</p>}><p>open</p></Show>
    </div>
  )
}
"#;

    // Many bindings: the binding enumeration and template rendering stage.
    let mut many_bindings = String::from("export function App(props) {\n  return <div>");
    for i in 0..200 {
        use std::fmt::Write as _;
        write!(
            many_bindings,
            "<span title={{props.t{i}}}>{{props.v{i}}}</span>"
        )
        .expect("writing to a String cannot fail");
    }
    many_bindings.push_str("</div>\n}\n");

    // Many components: the component binding and helper collection stages.
    let mut many_components = String::from("export function App(props) {\n  return <div>");
    for i in 0..100 {
        use std::fmt::Write as _;
        write!(many_components, "<Card{i} value={{props.v{i}}} />")
            .expect("writing to a String cannot fail");
    }
    many_components.push_str("</div>\n}\n");

    let deep = format!(
        "export function App(p) {{ return {}<span>{{p.x}}</span>{} }}\n",
        "<div>".repeat(40),
        "</div>".repeat(40)
    );

    measure("small", small, "small.tsx", TransformTarget::Dom, runs);
    measure("medium", medium, "medium.tsx", TransformTarget::Dom, runs);
    measure(
        "many-bindings (200)",
        &many_bindings,
        "bindings.tsx",
        TransformTarget::Dom,
        runs,
    );
    measure(
        "many-components (100)",
        &many_components,
        "components.tsx",
        TransformTarget::Dom,
        runs,
    );
    measure(
        "deep-jsx (40 levels)",
        &deep,
        "deep.tsx",
        TransformTarget::Dom,
        runs,
    );
    measure(
        "medium-ssr",
        medium,
        "medium.tsx",
        TransformTarget::Ssr,
        runs,
    );

    // Only prints when the crate was built with `--features stage-timing`.
    // `report()` returns an empty string otherwise, so this is unconditional
    // source and conditional output.
    let stages = zeus_compiler::stage_timing::report();
    if !stages.is_empty() {
        println!("\n{stages}");
    }
}
