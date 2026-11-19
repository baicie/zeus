# Compiler Performance Baseline

Measured on 2026-11-19, Apple silicon (aarch64-apple-darwin), release profile,
after the R17.0 module split and the Oxc 0.146 upgrade.

The point of this document is not the absolute numbers — those are
machine-specific. It is the before/after comparison on the same machine, which
is what shows whether the refactor cost anything.

---

## Method

`crates/zeus_compiler/examples/perf-baseline.rs` runs each input 50 times after
three warm-up runs and reports the median. The median over 50 samples is used
rather than the mean so a single scheduler hiccup does not move the number.

Each input stresses a different stage:

| Input                       | What it exercises                                                    |
| --------------------------- | -------------------------------------------------------------------- |
| `small`                     | parse + minimal lowering + one binding                               |
| `medium`                    | attributes, spread, `For`, `Show`, event delegation, component props |
| `many-bindings` (200 spans) | binding enumeration and template rendering                           |
| `many-components` (100)     | component binding collection and helper usage                        |
| `deep-jsx` (40 levels)      | nesting guard, element lowering, DOM path building                   |
| `medium-ssr`                | the SSR emitter over the same tree as `medium`                       |

Reproduce with:

```bash
cargo run -p zeus_compiler --example perf-baseline --release
```

---

## Before / after

Baseline is `649e2f60` (before R17.0) measured in a separate worktree with the
same example, same machine, same session. Each figure is the median of three
independent runs.

| Input                   | Before (ms) | After (ms) | Delta |
| ----------------------- | ----------- | ---------- | ----- |
| `small`                 | 0.039       | 0.013      | −67%  |
| `medium`                | 0.026       | 0.025      | −4%   |
| `many-bindings` (200)   | 1.440       | 1.421      | −1%   |
| `many-components` (100) | 0.525       | 0.536      | +2%   |
| `deep-jsx` (40)         | 0.061       | 0.063      | +3%   |
| `medium-ssr`            | 0.026       | 0.025      | −4%   |

### Reading this

The `small` figure is a first-run artifact in the baseline (0.039 vs 0.013 in
later runs of the same build) — at 13 µs the measurement is dominated by
allocator warm-up, not by the compiler. It is reported for completeness, not as
a 67% win.

Everything else is within ±3%, which is below the run-to-run variance observed
in both trees (the `many-bindings` case ranged 1.41–2.33 ms in one tree and
1.44–1.59 ms in the other across three runs). The honest conclusion:

**No measurable regression from the module split or the Oxc upgrade.** The
split moved code without changing the work done, and Oxc 0.146 is
behaviour-compatible with 0.144 by construction.

### What was not measured

- **Per-stage timing.** The pipeline has no instrumentation, and adding it as a
  default would put a cost on every production compile. The task allows it
  behind a flag; it was not added because the whole-pipeline numbers already
  show no regression and a stage breakdown with no regression to explain would
  be instrumentation without a purpose.
- **Peak memory.** Not measured. The split moved functions between modules
  without changing ownership or allocation, so memory behaviour should be
  identical by construction, but that is reasoning rather than evidence.
- **Native binary size and WASM size.** Not measured — the `.node` and `.wasm`
  artifacts were not built on this machine for this change.
- **Startup cost.** The napi loader path was not exercised.

These are named rather than claimed.

---

## Generated output size

Unchanged. The 45 golden fixtures are byte-identical before and after, which
means generated JS, source maps and hydration markers are the same size to the
byte. That is a stronger statement than a size measurement.

---

## When to revisit

Re-run this when:

- a change touches lowering or codegen hot paths (binding enumeration, template
  rendering, DOM path building)
- Oxc moves to a version with a different parser or semantic builder
- the `many-bindings` case grows past ~2 ms, which is where the binding
  collection stage becomes the dominant cost

A future comparison should use this table, not the raw numbers from an older
machine.
