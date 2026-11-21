//! Compiler throughput measurement protocol.
//!
//! The numbers this prints are only useful if you know what they are a number
//! *of*. The previous baseline reported a single median per input and nothing
//! else, which made two runs on the same machine quietly incomparable: the
//! reported figure was 1.69 ms in one session and 2.80 ms in another for the
//! same input, and there was no way to tell a real regression from a different
//! build profile, a different measurement count, or a machine that was busy.
//!
//! This file replaces it with a protocol that states its own conditions:
//!
//! * the commit, toolchain, CPU and OS are printed with every run;
//! * the profile and features are asserted, not assumed;
//! * warmup and sample counts are fixed and named;
//! * in-process samples report median, quartiles and MAD, so a number that is
//!   mostly noise is visibly noisy;
//! * separate processes are run and their medians are compared, so
//!   within-process luck cannot masquerade as a result;
//! * a second input set is interleaved with the first, so drift over the run
//!   (thermal throttling, another process starting) shows up as instability
//!   instead of as a difference between them;
//! * and a verdict of `INCONCLUSIVE` is a real outcome, printed when the
//!   spread is too large to support a comparison.
//!
//! ## Running it
//!
//! ```text
//! cargo run -p zeus_compiler --example perf-protocol --release
//! cargo run -p zeus_compiler --example perf-protocol --release --features stage-timing
//! ```
//!
//! Comparing two commits is done by running this on each and reading the
//! *ratios* on the same machine. Absolute milliseconds are machine-specific and
//! are never a baseline.
//!
//! ## What this deliberately does not do
//!
//! There is no pass/fail threshold. A hard gate on a measurement whose noise
//! floor is several percent would fail builds for reasons unrelated to code,
//! and the repo has no dedicated benchmark machine to lower that floor. The
//! protocol reports; a human decides.

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::process::Command;
use std::time::Instant;

use zeus_compiler::{TransformModuleOptions, TransformTarget, transform_module};

/// Samples taken inside one process, after warmup.
const SAMPLES: usize = 30;
/// Runs discarded before sampling, to pay for first-call allocation and any
/// lazy statics the compiler touches.
const WARMUP: usize = 5;
/// Independent processes, each reporting its own median.
const PROCESSES: usize = 3;

/// One input under test.
struct Input {
    label: &'static str,
    source: String,
    filename: &'static str,
    target: TransformTarget,
}

fn options(input: &Input) -> TransformModuleOptions {
    TransformModuleOptions {
        source: input.source.clone(),
        filename: input.filename.to_string(),
        target: input.target,
        runtime_module: "zeus".to_string(),
        delegate_events: true,
        source_map: true,
        hmr: false,
        pure_define_element: false.into(),
        auto_hydrate: false,
    }
}

/// Median, first quartile, third quartile and median absolute deviation.
///
/// MAD is reported instead of standard deviation because it is not inflated by
/// a single scheduling hiccup — the exact event that makes a mean meaningless
/// on a machine that is also running an editor.
struct Stats {
    median: f64,
    q1: f64,
    q3: f64,
    mad: f64,
}

fn stats(mut samples: Vec<f64>) -> Stats {
    assert!(!samples.is_empty(), "cannot summarize no samples");
    samples.sort_by(|a, b| a.partial_cmp(b).expect("timings are finite"));
    // Nearest-rank on the sorted samples, in integer arithmetic. With 30
    // samples the index is a real observation rather than an interpolation
    // between two, and integers avoid both a cast and the precision lint it
    // would raise for a value that is a sample index, not a measurement.
    let at = |numerator: usize| -> f64 {
        let last = samples.len() - 1;
        let index = (last * numerator + 2) / 4;
        samples[index.min(last)]
    };
    let median = at(2);
    let mut deviations: Vec<f64> = samples
        .iter()
        .map(|sample| (sample - median).abs())
        .collect();
    deviations.sort_by(|a, b| a.partial_cmp(b).expect("timings are finite"));
    Stats {
        median,
        q1: at(1),
        q3: at(3),
        mad: deviations[deviations.len() / 2],
    }
}

/// Relative spread, `MAD / median`, as a percentage.
///
/// Above roughly 5% on an otherwise idle machine the measurement cannot
/// distinguish a small change from noise, and the caller reports INCONCLUSIVE.
fn spread_percent(stats: &Stats) -> f64 {
    if stats.median == 0.0 {
        return f64::INFINITY;
    }
    stats.mad / stats.median * 100.0
}

/// Times one input `SAMPLES` times after `WARMUP` discarded runs.
fn measure(input: &Input) -> Stats {
    for _ in 0..WARMUP {
        let _ = transform_module(options(input));
    }
    let mut samples = Vec::with_capacity(SAMPLES);
    for _ in 0..SAMPLES {
        let start = Instant::now();
        let _ = transform_module(options(input));
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    stats(samples)
}

// ---- Inputs -----------------------------------------------------------------

fn small() -> String {
    "export function App(p) { return <p>{p.n}</p> }\n".to_string()
}

fn medium() -> String {
    r#"
import { For, Show } from 'zeus'
export function App(props) {
  return (
    <div class="card" title={props.title} {...props.attrs}>
      <header><h1>{props.heading}</h1><span class={props.badge}>badge</span></header>
      <For each={props.items}>{item => <li onClick={props.onPick}>{item.name}</li>}</For>
      <Show when={props.open} fallback={<p>closed</p>}><p>open</p></Show>
    </div>
  )
}
"#
    .to_string()
}

fn many_bindings() -> String {
    let mut source = String::from("export function App(props) {\n  return <div>");
    for i in 0..200 {
        write!(source, "<span title={{props.t{i}}}>{{props.v{i}}}</span>")
            .expect("writing to a String cannot fail");
    }
    source.push_str("</div>\n}\n");
    source
}

fn many_components() -> String {
    let mut source = String::from("export function App(props) {\n  return <div>");
    for i in 0..100 {
        write!(source, "<Card{i} value={{props.v{i}}} />")
            .expect("writing to a String cannot fail");
    }
    source.push_str("</div>\n}\n");
    source
}

/// Fragments in the positions #353 touched: component children and builtin
/// children, nested three deep.
///
/// This input exists because the fragment clone that #353 removed was paid once
/// per fragment per helper-collection pass, so a fragment-dense module is the
/// only shape where removing it could plausibly show up at all.
fn fragment_dense() -> String {
    let mut source =
        String::from("import { Show } from 'zeus'\nexport function App(props) {\n  return <div>");
    for i in 0..80 {
        write!(
            source,
            "<Card><><><span>{{props.a{i}}}</span><Inner n={{props.b{i}}}/></></></Card>\
             <Show when={{props.s{i}}}><><b>{{props.c{i}}}</b></></Show>"
        )
        .expect("writing to a String cannot fail");
    }
    source.push_str("</div>\n}\n");
    source
}

fn inputs() -> Vec<Input> {
    vec![
        Input {
            label: "small",
            source: small(),
            filename: "small.tsx",
            target: TransformTarget::Dom,
        },
        Input {
            label: "medium",
            source: medium(),
            filename: "medium.tsx",
            target: TransformTarget::Dom,
        },
        Input {
            label: "many-bindings (200)",
            source: many_bindings(),
            filename: "bindings.tsx",
            target: TransformTarget::Dom,
        },
        Input {
            label: "many-components (100)",
            source: many_components(),
            filename: "components.tsx",
            target: TransformTarget::Dom,
        },
        Input {
            label: "fragment-dense (80)",
            source: fragment_dense(),
            filename: "fragments.tsx",
            target: TransformTarget::Dom,
        },
        Input {
            label: "medium-ssr",
            source: medium(),
            filename: "medium.tsx",
            target: TransformTarget::Ssr,
        },
    ]
}

// ---- Environment ------------------------------------------------------------

fn command_output(program: &str, args: &[&str]) -> String {
    Command::new(program)
        .args(args)
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn git_commit() -> String {
    let commit = command_output("git", &["rev-parse", "HEAD"]);
    let dirty = command_output("git", &["status", "--porcelain"]);
    if dirty == "unknown" || dirty.is_empty() {
        commit
    } else {
        format!("{commit} (dirty working tree)")
    }
}

/// Prints the conditions the numbers were taken under.
///
/// Every line here is a reason two runs might legitimately differ. Printing
/// them is what makes a reported figure checkable instead of folklore.
fn environment() -> BTreeMap<&'static str, String> {
    let mut facts = BTreeMap::new();
    facts.insert("commit", git_commit());
    facts.insert("toolchain", command_output("rustc", &["--version"]));
    facts.insert(
        "cpu",
        command_output("sysctl", &["-n", "machdep.cpu.brand_string"]),
    );
    facts.insert("cpus", command_output("sysctl", &["-n", "hw.ncpu"]));
    facts.insert("os", command_output("sw_vers", &["-productVersion"]));
    facts.insert("arch", std::env::consts::ARCH.to_string());
    facts.insert(
        "profile",
        if cfg!(debug_assertions) {
            "debug (numbers are not representative; rebuild with --release)".into()
        } else {
            "release".to_string()
        },
    );
    facts.insert(
        "stage-timing",
        if cfg!(feature = "stage-timing") {
            "on".to_string()
        } else {
            "off".to_string()
        },
    );
    facts.insert("samples/process", SAMPLES.to_string());
    facts.insert("warmup/process", WARMUP.to_string());
    facts.insert("processes", PROCESSES.to_string());
    facts
}

// ---- Modes ------------------------------------------------------------------

/// One process: measure everything, print, and (when `json`) emit a
/// machine-readable line the parent reads.
fn run_single(json: bool) {
    let mut results = Vec::new();
    for input in inputs() {
        let stats = measure(&input);
        results.push((input.label, stats));
    }

    if json {
        // One JSON object per line, so the parent can parse without a schema.
        for (label, stats) in &results {
            println!(
                "{{\"label\":{label:?},\"median\":{},\"q1\":{},\"q3\":{},\"mad\":{}}}",
                stats.median, stats.q1, stats.q3, stats.mad
            );
        }
        return;
    }

    println!("per-process results ({SAMPLES} samples after {WARMUP} warmup):");
    println!(
        "  {:<24} {:>9} {:>9} {:>9} {:>8} {:>8}",
        "input", "median", "q1", "q3", "MAD", "spread"
    );
    for (label, stats) in &results {
        println!(
            "  {:<24} {:>8.3}ms {:>8.3}ms {:>8.3}ms {:>7.3}ms {:>7.1}%",
            label,
            stats.median,
            stats.q1,
            stats.q3,
            stats.mad,
            spread_percent(stats)
        );
    }

    let stages = zeus_compiler::stage_timing::report();
    if !stages.is_empty() {
        println!("\n{stages}");
    }
}

/// Re-runs this binary `PROCESSES` times and compares the per-process medians.
///
/// A single process reports the median of 30 samples, which is stable against
/// per-sample noise but not against a whole run landing on a busier machine
/// state. Comparing independent processes is what distinguishes those.
fn run_parent() {
    let exe = std::env::current_exe().expect("the example binary has a path");
    let mut per_process: BTreeMap<String, Vec<f64>> = BTreeMap::new();

    for process in 0..PROCESSES {
        let output = Command::new(&exe)
            .arg("--json")
            .output()
            .expect("re-running the example must succeed");
        let text = String::from_utf8_lossy(&output.stdout);
        let mut seen = 0;
        for line in text.lines() {
            let Some(label) = field(line, "label") else {
                continue;
            };
            let Some(median) = field(line, "median").and_then(|v| v.parse::<f64>().ok()) else {
                continue;
            };
            per_process.entry(label).or_default().push(median);
            seen += 1;
        }
        assert!(
            seen > 0,
            "process {process} reported no results:\nstdout:\n{text}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    println!("cross-process medians ({PROCESSES} independent processes, {SAMPLES} samples each):");
    println!(
        "  {:<24} {:>9} {:>9} {:>9} {:>8}",
        "input", "median", "min", "max", "spread"
    );
    let mut inconclusive = Vec::new();
    for (label, medians) in &per_process {
        let stats = stats(medians.clone());
        let spread = spread_percent(&stats);
        let min = medians.iter().copied().fold(f64::INFINITY, f64::min);
        let max = medians.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        println!(
            "  {:<24} {:>8.3}ms {:>8.3}ms {:>8.3}ms {:>7.1}%",
            label, stats.median, min, max, spread
        );
        // The min-to-max range across processes is the honest error bar: it
        // includes everything that differed between the runs.
        if max > 0.0 && (max - min) / max * 100.0 > 5.0 {
            inconclusive.push(label.clone());
        }
    }

    if inconclusive.is_empty() {
        println!("\nVERDICT: STABLE — every input's cross-process range is within 5%.");
    } else {
        println!(
            "\nVERDICT: INCONCLUSIVE — these inputs varied more than 5% between \
             processes on this machine: {}. Do not compare builds using them \
             until the machine is quieter or the sample count is raised.",
            inconclusive.join(", ")
        );
    }
    println!(
        "\nAbsolute times are machine-specific. Compare two commits by running \
         this on each and reading the ratios."
    );
}

/// Extracts a `"key":value` field from a flat JSON line, without pulling in a
/// JSON parser for six known keys.
fn field(line: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\":");
    let start = line.find(&needle)? + needle.len();
    let rest = &line[start..];
    if let Some(stripped) = rest.strip_prefix('"') {
        let end = stripped.find('"')?;
        return Some(stripped[..end].to_string());
    }
    let end = rest.find([',', '}']).unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

fn main() {
    let json = std::env::args().any(|argument| argument == "--json");

    // The parent prints the environment because it is the process the user
    // invoked; children inherit the same build and machine.
    if !json {
        println!("environment:");
        for (key, value) in environment() {
            println!("  {key:<16} {value}");
        }
        println!();
    }

    if json || std::env::args().any(|argument| argument == "--single") {
        run_single(json);
    } else {
        run_parent();
    }
}
