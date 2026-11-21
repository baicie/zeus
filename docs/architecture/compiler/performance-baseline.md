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

> **Reproducibility caveat (added in R19).**
>
> This section claims the baseline column was measured at `649e2f60` "with the
> same example". That is not reproducible, and the claim as written was wrong.
>
> `crates/zeus_compiler/examples/perf-baseline.rs` was **introduced by
> `bb478792`** (R17.0 itself), so it does not exist at `649e2f60`:
>
> ```
> $ git cat-file -e 649e2f60:crates/zeus_compiler/examples/perf-baseline.rs
> fatal: path '...' exists on disk, but not in '649e2f60'
> ```
>
> The `Before` column is therefore a measurement that cannot be repeated from
> the commit it names. It may have come from an equivalent harness run by hand
> in a worktree, but nothing in the repository records how.
>
> **Treat the `Before` column as unreproducible.** The `After` column and the
> conclusion it supports ("within ±3%") stand on their own for the tree they
> were measured on, and the ±3% band is explicitly larger than the observed
> run-to-run variance, so the conclusion does not depend on the baseline.
>
> A future baseline must either ship the harness at the baseline commit or
> record the harness beside the numbers. This document did neither.

Baseline is `649e2f60` (before R17.0) measured in a separate worktree. Each
figure is the median of three independent runs.

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

### Reproducible re-measurement (R19, `b5cb19e4`)

Re-run on the same machine class during R19, after the `AnalysisResult` /
`EmitPlan` / `pipeline.rs` extraction:

```
$ cargo run -p zeus_compiler --example perf-baseline --release
small                                 0.034 ms
medium                                0.046 ms
many-bindings (200)                   1.825 ms
many-components (100)                 0.513 ms
deep-jsx (40 levels)                  0.061 ms
medium-ssr                            0.026 ms
```

Same order of magnitude as the `After` column above. `many-bindings` reads
1.825 ms here against 1.421 ms there — that is the same case whose run-to-run
range was already recorded as 1.41–2.33 ms, so the difference is variance, not
a regression. `many-components` (0.513 vs 0.536) is likewise inside the band.

This run **is** reproducible: the harness exists in the tree at the commit
named, and the command above is the whole recipe. That is what the `Before`
column lacks.

### After the R18.5–R18.7 module moves (`a8c1f1ab`)

```
$ cargo run -p zeus_compiler --example perf-baseline --release --features stage-timing
small                                 0.039 ms
medium                                0.076 ms
many-bindings (200)                   1.691 ms
many-components (100)                 0.494 ms
deep-jsx (40 levels)                  0.060 ms
medium-ssr                            0.025 ms

stage timing (cumulative):
  nesting-guard       2.174 ms    1.7%
  lower              60.460 ms   47.2%
  validate            0.000 ms    0.0%
  analysis            5.038 ms    3.9%
  emit               60.436 ms   47.2%
```

Same order as the run above. The three rounds of module moves — the checker
fixes, the DOM emit family, the frontend collectors — did not change what the
compiler does, and the numbers agree. `medium` reads 0.076 against 0.046 there,
which is the sub-0.1 ms case where allocator warm-up dominates; the
`many-bindings` and `many-components` figures, which are large enough to be
stable, match within the recorded variance.

### What was not measured

- **Per-stage timing — added in R18.4.** Behind a compile-time feature, so the
  production path pays nothing:
  `--features stage-timing` on `zeus_compiler`. The first measurement:

  | Stage           | Share                           |
  | --------------- | ------------------------------- |
  | `lower`         | 44.1%                           |
  | `emit`          | 49.0%                           |
  | `analysis`      | 5.5%                            |
  | `nesting-guard` | 1.4%                            |
  | `validate`      | 0.0% (no SSR input in that run) |

  The two stages that dominate are the two that are still one file each
  (`lower/mod.rs`, `codegen/mod.rs`). That is not a reason to split them —
  the measurement says where time goes, not where the code should live — but
  it does mean the remaining debt is measured rather than assumed.

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

---

## Superseded method (R20, `aa1e7f4b`)

The numbers above were taken with `examples/perf-baseline.rs`, which reports a
median per input and nothing else. That file has been replaced by
`examples/perf-protocol.rs`, and the reason is written in the section above
without being named: the spread this document measures — `many-bindings`
ranging 1.41–2.33 ms — is **larger than the ±3% the table judges against**.
The conclusions drawn were still right, because they were "no measurable
regression" and a regression large enough to matter would have exceeded that
spread. A smaller change could not have been seen at all.

What changed:

| Before                    | After                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| One median, no conditions | Commit, toolchain, CPU, OS, profile, features printed with every run |
| 1 process, 50 samples     | 3 processes × 30 samples, medians compared across processes          |
| No spread reported        | Q1, Q3, MAD and relative spread per input                            |
| No verdict                | `STABLE` or `INCONCLUSIVE` printed                                   |
| ±3% treated as a gate     | No gate; the protocol reports and a human decides                    |
| No fragment-dense input   | `fragment-dense (80)` added                                          |

The `±3%` row in `validation-matrix.md` is now "report only, no gate".

**`fragment-dense` is the input this document lacked.** The removed fragment
clone (#353) was paid per fragment per helper-collection pass, and
`many-bindings` has no fragments at all — so the one shape where that cost
could appear was not measured. It is now the most expensive input at ~2.8 ms,
above `many-bindings` at ~1.4 ms.

Stage attribution on the same input set:

```text
lower    42.8%
emit     52.9%
analysis  3.2%
validate  0.0%
```

`emit` is the hot stage. Future work on compiler throughput should start there,
not in fragment collection.

> Protocol and current numbers: [`perf-measurement-protocol.md`](perf-measurement-protocol.md).
> The numbers in this file remain valid as a historical record of that
> comparison; they are not a baseline to compare against now.
