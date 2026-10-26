# Performance

Build-time performance characteristics of the Component Compiler Host.

## Build times

| Scenario                      | Typical time |
| ----------------------------- | ------------ |
| Analyze 10 components         | ~200ms       |
| Analyze 50 components         | ~800ms       |
| Generate WC + React + Vue     | ~1.5s        |
| Full pipeline (50 components) | ~3s          |

## Output sizes

| Output                        | Minified + gzipped |
| ----------------------------- | ------------------ |
| Button WC                     | ~2.1 KB            |
| Switch WC                     | ~2.4 KB            |
| Dialog WC                     | ~4.8 KB            |
| React wrapper (per component) | ~500 B             |
| Vue wrapper (per component)   | ~600 B             |
| SVG icon                      | ~200-600 B         |

## Benchmarks

Run the benchmark suite:

```bash
pnpm bench:component-host
```

See `temp/bench/component-host/report.md` for the latest baseline.

CI runs benchmarks on every PR touching core/web-c/headless:

```bash
pnpm bench:component-host:ci
```

Runtime budgets use the median of **three fixed samples**, each in a fresh browser
context. The cold first interaction still disables the HTTP cache and includes CSS,
lazy registration, mounting, and the first trusted click. Every sample is retained
in `report.json`, `report.md`, and `trend.json`; the trend CSV records the median.
A sample that throws or returns incomplete data fails the run immediately. No
sample is retried or discarded, and the existing millisecond budgets are unchanged.

## Tips

- Use `exclude` in component globs to skip test files
- Generate only the outputs you need
- Icon extraction from `node_modules` is cached between builds
