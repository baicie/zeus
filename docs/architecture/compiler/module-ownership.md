# Compiler Module Ownership

Where each concern lives today, and where it must live after the split. A
function belongs to the stage whose question it answers, not to the file it
happens to sit in.

The rule that decides most cases: **a module may compute facts and record them;
it may not reach into a later stage to re-derive those facts.**

---

## Ownership table

| Concern                                                | Today                          | Owner after split          |
| ------------------------------------------------------ | ------------------------------ | -------------------------- |
| Input nesting guard                                    | `nesting.rs`                   | `frontend/nesting.rs`      |
| Source type detection                                  | `lib.rs`, `lower.rs`           | `frontend/parse.rs`        |
| Oxc parse                                              | `lower.rs:65`                  | `frontend/parse.rs`        |
| Semantic build                                         | `lower.rs:75`                  | `frontend/semantic.rs`     |
| Builtin recognition (`Show`, `For`, `Host`, `Slot`, …) | `lower.rs:2924`                | `frontend/semantic.rs`     |
| Imported-name collection                               | `lower.rs:2993`                | `frontend/semantic.rs`     |
| Reserved-name collection                               | `lower.rs:395`                 | `frontend/semantic.rs`     |
| Oxc diagnostic mapping                                 | `lower.rs:3511`                | `frontend/diagnostics.rs`  |
| JSX text normalization, entity decoding                | `lower.rs:3504`, `3538`        | `frontend/parse.rs`        |
| Attribute name normalization                           | `lower.rs:2874`                | `lowering/attributes.rs`   |
| Root lowering                                          | `lower.rs:489`                 | `lowering/elements.rs`     |
| Element lowering                                       | `lower.rs:553`                 | `lowering/elements.rs`     |
| Element validation                                     | `lower.rs:590`                 | `lowering/elements.rs`     |
| Raw-text children                                      | `lower.rs:646`                 | `lowering/elements.rs`     |
| Component lowering                                     | `lower.rs:696–802`             | `lowering/components.rs`   |
| Component callee                                       | `lower.rs:1691`                | `lowering/components.rs`   |
| Component props                                        | `lower.rs:1740`                | `lowering/components.rs`   |
| Attribute lowering                                     | `lower.rs:1818–2021`           | `lowering/attributes.rs`   |
| Spread                                                 | `lower.rs:1841`                | `lowering/attributes.rs`   |
| Builtin expression attributes                          | `lower.rs:1365`                | `lowering/attributes.rs`   |
| Event attributes                                       | part of `lower_attribute`      | `lowering/bindings.rs`     |
| Ref attributes                                         | part of `lower_attribute`      | `lowering/bindings.rs`     |
| `once` marker family                                   | `lower.rs:2383–2535`           | `lowering/bindings.rs`     |
| Show                                                   | `lower.rs:953`                 | `lowering/control_flow.rs` |
| For                                                    | `lower.rs:996`, `1246`         | `lowering/control_flow.rs` |
| Transition                                             | `lower.rs:1091`, `1132`        | `lowering/control_flow.rs` |
| ErrorBoundary                                          | `lower.rs:832–951`             | `lowering/control_flow.rs` |
| Dynamic regions                                        | `lower.rs:1451–1630`           | `lowering/control_flow.rs` |
| Child dispatch                                         | `lower.rs:2140–2259`           | `lowering/elements.rs`     |
| Async rejection                                        | `lower.rs:2273–2316`           | `lowering/mod.rs`          |
| HMR info collection                                    | `lower.rs:3028`                | `support/hmr.rs`           |
| defineElement setup discovery                          | `lower.rs:2968–3400`           | `lowering/components.rs`   |
| SSR runtime import collection                          | `lower.rs:212`                 | `analysis/imports.rs`      |
| Binding enumeration                                    | `codegen.rs:3138–3277`         | `analysis/bindings.rs`     |
| Delegated-event set                                    | `codegen.rs:3354–3548`         | `analysis/bindings.rs`     |
| Locator attribute allocation                           | `codegen.rs:3557–3726`         | `analysis/templates.rs`    |
| Helper usage                                           | `codegen.rs:231`, `4074–4158`  | `analysis/helpers.rs`      |
| Template interning                                     | `codegen.rs:208`               | `passes/optimize.rs`       |
| Component binding lists                                | `codegen.rs:223`               | `analysis/bindings.rs`     |
| Template HTML rendering                                | `codegen.rs:3036–3138`         | `codegen/templates.rs`     |
| HTML escaping, void elements                           | `html.rs`                      | `support/html.rs`          |
| DOM emitter                                            | `codegen.rs` (most of it)      | `codegen/dom.rs`           |
| DOM binding emitters                                   | `codegen.rs:1809–3030`         | `codegen/bindings.rs`      |
| DOM component emission                                 | `codegen.rs:1844–2292`         | `codegen/components.rs`    |
| Event emission                                         | `codegen.rs:2029–2088`, `1220` | `codegen/events.rs`        |
| Runtime import emission                                | `codegen.rs:1242`              | `codegen/imports.rs`       |
| SSR emitter                                            | `codegen.rs:564–1220`          | `codegen/ssr.rs`           |
| Auto hydration                                         | `codegen.rs:1295–1808`         | `codegen/hydration.rs`     |
| HMR boundary emission                                  | `codegen.rs:450–563`           | `codegen/hmr.rs`           |
| Source map building                                    | `codegen.rs:3735`              | `codegen/sourcemap.rs`     |
| Name allocation                                        | inside `ComponentEmitter`      | `codegen/names.rs`         |
| `CodeWriter`                                           | `codegen.rs`                   | `codegen/writer.rs`        |
| Hydration plan                                         | `hydration.rs`                 | `support/hydration.rs`     |
| SSR property validation                                | `ssr.rs`                       | `passes/validate.rs`       |
| IR node definitions                                    | `ir.rs`                        | `ir/nodes.rs`              |
| Source spans                                           | `span.rs`                      | `support/span.rs`          |
| Diagnostics type                                       | `diagnostic.rs`                | `support/diagnostic.rs`    |
| Stage ordering                                         | `lib.rs:161`                   | `pipeline.rs`              |

---

## What stays where it is

**`ir.rs` stays a data module.** Its 505 lines are serde structs and `From`
conversions. Moving it into a directory buys nothing unless the module grows a
validation pass, at which point `ir/validate.rs` is the right addition.

**`nesting.rs` stays one file.** Its 1,491 lines are a single byte scanner with
one job. Splitting it would separate a state machine from its states.

**`span.rs` and `diagnostic.rs` stay small.** They are contracts, not stages.

---

## Anti-patterns this split must not reintroduce

**A `Lowerer` that owns everything.** The current struct holds the IR, the
diagnostics, the symbol table, the builtin bindings and the NodeId counter, and
90+ methods mutate all of it. The replacement keeps a context that _carries_
those things but moves each rule into a module that receives the context and
returns a node. If the new modules all take `&mut LoweringContext` and reach
into its fields arbitrarily, nothing has improved.

**Codegen that re-analyses.** If `codegen/dom.rs` still calls
`collect_delegated_events`, the analysis module exists in name only. Codegen
receives an `EmitPlan` produced before it runs.

**A pass manager.** There are five fixed steps in a fixed order. A dynamic
registry of passes would add indirection to make a static sequence look
flexible.

**Empty directories.** If `passes/optimize.rs` has one function, that is fine —
it has a job. If it has zero, it should not exist until it does.

---

## Dependency direction inside the crate

```
frontend ──┐
           ├──> lowering ──> ir <── support
           │                  │
           └──────────────────┴──> analysis ──> passes ──> codegen
```

- `frontend` knows Oxc; nothing downstream does.
- `lowering` knows JSX semantics; it must not know how code is emitted.
- `ir` depends on `support` only (`SourceSpan`).
- `analysis` reads `ir`; it must not emit.
- `passes` transforms `ir` and analysis output.
- `codegen` emits from `ir` plus the plan; it must not parse or lower.
- `support` is leaf-level and may be used by any stage, including `frontend`.
