# Current Compiler Pipeline

The state of `crates/zeus_compiler` before R17.0, measured at `649e2f60`.

The compiler is one crate with eleven modules and a single public entry point,
`transform_module`. This document records what the pipeline actually does, so a
refactor can be judged against it rather than against an imagined design.

---

## Call graph

```
transform_module(options)                       lib.rs:161
│
├─ nesting_diagnostic(&options)                 lib.rs:120
│    SourceType::from_path → nesting::exceeds_nesting_cost_with_jsx
│    ↳ on failure returns ZEUS_INPUT_TOO_DEEP and stops
│
├─ lower::lower_module(source, filename)        lower.rs:63
│  │
│  ├─ Parser::new(allocator, source, source_type).parse()
│  ├─ SemanticBuilder::new().build(&program)
│  ├─ collect_builtin_names(program)            lower.rs:2924   Show/For/Host/Slot/Transition/ErrorBoundary
│  ├─ collect_imported_names(program)           lower.rs:2993
│  ├─ collect_reserved_names(scoping)           lower.rs:395
│  ├─ collect_hmr_info(program)                 lower.rs:3028
│  ├─ collect_ssr_runtime_imports(program)      lower.rs:212
│  ├─ collect_setup_functions(program)          lower.rs:3212   defineElement setup discovery
│  ├─ collect_top_level_define_element_calls()  lower.rs:310
│  ├─ collect_async_components(program)         lower.rs:2723   rejects async components
│  ├─ Lowerer::new(...)                         lower.rs:411     ← the lowering God Object
│  │    └─ visit_program: walk every JSX root, allocate NodeId in source order
│  │         lower_root / lower_root_fragment        lower.rs:489, 538
│  │         lower_element                            lower.rs:553
│  │         lower_component / _with_kind             lower.rs:696, 708
│  │         lower_show / lower_for / lower_transition / lower_error_boundary
│  │         lower_attributes / lower_attribute / lower_expression_attribute
│  │         lower_children / lower_child
│  │         lower_dynamic_region (+ array/map/ternary variants)
│  └─ returns LowerResult { ir, diagnostics, reserved_names, hmr,
│                           pure_define_element_calls, ssr_runtime_imports,
│                           error_boundary_spans }
│
├─ early exits                                   lib.rs:172-236
│    diagnostics → no components and nothing to rewrite → source unchanged
│    SSR + ErrorBoundary spans → ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED
│    SSR + ssr::validate_ssr_properties → unsupported prop diagnostics
│
├─ hydration::build_hydration_plan(&ir)          hydration.rs:1
│
└─ target dispatch                               lib.rs:244
     ├─ codegen::emit_ssr_module(SSR options)    codegen.rs:XXX
     └─ codegen::emit_module(DOM options)        codegen.rs:XXX
```

Two properties of this graph matter for the refactor:

1. **Lowering does almost everything in one pass over one mutable struct.**
   `Lowerer` has 90+ methods and holds the IR being built, the diagnostics
   being collected, the symbol table, the builtin bindings and the NodeId
   counter. Every `lower_*` method both _decides_ semantics and _records_ them.
2. **Codegen re-derives facts it did not receive.** `emit_module` walks the IR
   again to collect bindings, helper usage, delegated events, attribute names
   and template interning. The lowering result carries no plan for codegen;
   codegen builds its own.

---

## Stage-by-stage inventory

### Frontend — understanding the source

| Concern               | Where                                   | Notes                                                                                                                                                                                                      |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source type detection | `lib.rs:121`, `lower.rs:64`             | `oxc_span::SourceType::from_path`; an unknown extension falls through to lowering, which reports it                                                                                                        |
| Input nesting guard   | `nesting.rs` (1,491 lines)              | A hand-written byte scanner, not a parser. Estimates a nesting cost before Oxc runs, so a pathological input becomes a diagnostic instead of a stack overflow. Has its own tests and a 35%-of-stack budget |
| Parse                 | `lower.rs:65`                           | `oxc_parser`                                                                                                                                                                                               |
| Semantic analysis     | `lower.rs:75`                           | `SemanticBuilder`; provides `Scoping`, `SymbolId`, references                                                                                                                                              |
| Builtin recognition   | `lower.rs:2924` `collect_builtin_names` | Matches imported names against `Show`/`For`/… and records whether the import is the real Zeus one                                                                                                          |
| Diagnostics from Oxc  | `lower.rs:3511` `from_oxc_diagnostic`   | Maps Oxc errors into `CompilerDiagnostic`                                                                                                                                                                  |

The frontend is the least tangled part: it produces facts, not decisions.

### Lowering — source semantics to Zeus IR

`Lowerer` (lower.rs:411–2535, ~2,100 lines) owns:

- **NodeId allocation** (`allocate_id`, lower.rs:483) — a single monotonic
  counter. Order is observable: hydration markers and DOM paths derive from it.
- **Elements** — `lower_element`, `validate_element`, `lower_raw_text_children`
- **Components** — `lower_component_with_kind` (lower.rs:708, 95 lines), which
  branches into the six builtins and the ordinary-component path
- **Attributes** — `lower_attribute` (lower.rs:1861, ~98 lines),
  `lower_expression_attribute` (lower.rs:2021, ~119 lines),
  `lower_attribute_name`, `lower_spread`
- **Control flow** — `lower_show`, `lower_for`, `lower_for_callback`,
  `lower_transition`, `lower_error_boundary`, `lower_error_fallback`
- **Dynamic regions** — six methods covering the generic, array-literal,
  array-map and nested-value shapes
- **Children** — `lower_children`, `lower_child`, `lower_element_child`
- **Diagnostics** — `unsupported`, `report_async_*`, the `once` marker family
  (`reject_once_marker`, `has_once_marker`, `is_once_intrinsic_call`, …)

These are not separable by file alone: `lower_attribute` calls
`lower_expression`, reads `self.builtin_kind`, and pushes diagnostics through
`self.unsupported`. Splitting them means first separating _what lowering knows_
(the context) from _what it does_ (the rules).

### IR — the contract

`ir.rs` (505 lines) defines `ModuleIr`, `RootIr`, `ElementIr`, `AttributeIr`,
`ChildIr`, the binding variants, and the builtin bindings. It is a data
definition with serde derives and no logic beyond `From` conversions.

This module is already the right shape. The refactor should leave its _content_
alone and move it into a directory only if that helps navigation.

### Analysis — facts codegen needs

These functions live in `codegen.rs` but are analysis, not emission:

| Function                                                                                                                                       | Line      | What it computes                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `collect_component_bindings`                                                                                                                   | 223       | per-component dynamic binding lists                                          |
| `collect_module_helper_usage`                                                                                                                  | 231       | which runtime helpers the module imports                                     |
| `intern_static_templates`                                                                                                                      | 208       | which static templates are shared                                            |
| `collect_dynamic_bindings` / `collect_element_bindings` / `collect_fragment_bindings`                                                          | 3138–3277 | binding enumeration                                                          |
| `collect_delegated_events` (+ 9 helpers)                                                                                                       | 3354–3548 | the event delegation set                                                     |
| `allocate_locator_attribute`                                                                                                                   | 3557      | the `data-zeus-*` attribute name, avoiding collisions with author attributes |
| `collect_root/component/builtin_attribute_names`                                                                                               | 3577–3726 | used to pick a non-colliding locator                                         |
| `collect_root_dynamic_bindings`                                                                                                                | 3144      | root-level binding set                                                       |
| `has_element_binding`, `element_has_spread`, `has_dynamic_raw_text`, `is_unescaped_raw_text`, `ssr_text_context`, `collect_text_content_parts` | 3160–3354 | per-element facts                                                            |

These run before emission and do not write output. They are the clearest
candidates for an `analysis/` module.

### Codegen — producing code

`codegen.rs` (5,057 lines) contains four distinct emitters that share one
`CodeWriter` and `NameAllocator`:

| Emitter         | Functions                                                                                             | Lines  |
| --------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| DOM component   | `ComponentEmitter` (289), `emit_component`, `emit_*_binding`, `emit_*_mount_call`                     | ~2,400 |
| SSR module      | `SsrSourceEmitter` (564), `emit_ssr_*` (14 functions)                                                 | ~700   |
| Templates       | `render_template`, `render_fragment`, `render_element`, `escape_html_*`                               | ~250   |
| Hydration / HMR | `emit_auto_hydration_*`, `emit_hmr_boundary`, `allocate_hmr_insertions`, `allocate_source_insertions` | ~900   |

Plus `GeneratedComponent` (3,783, ~170 lines) and `HelperUsage` (4,074) as the
shared output model, and `build_source_map` (3,735) for the map.

### Support — cross-stage helpers

| Module          | Lines | Role                              |
| --------------- | ----- | --------------------------------- |
| `span.rs`       | 195   | `SourceSpan`, position conversion |
| `html.rs`       | 159   | HTML escaping, void elements      |
| `hydration.rs`  | 348   | hydration plan from IR            |
| `hmr.rs`        | 186   | HMR plan types and signature      |
| `diagnostic.rs` | 46    | `CompilerDiagnostic`              |
| `nesting.rs`    | 1,491 | input nesting guard               |
| `ssr.rs`        | 162   | SSR property validation           |

---

## Observations that drive the refactor

**The pipeline is not visible in one place.** `transform_module` in `lib.rs` is
233 lines of interleaved early exits, validation and dispatch. Reading the
order of stages means reading `lib.rs`, then `lower.rs` for what lowering
produces, then `codegen.rs` for what codegen re-derives.

**Lowering and analysis overlap.** `Lowerer` decides Show/For semantics, but
`codegen.rs` separately collects delegated events, attribute names and binding
lists from the resulting IR. Neither side owns "what this module needs at
runtime".

**Codegen has no explicit plan input.** `emit_module` receives `ModuleIr` plus
lowering side-channels (`reserved_names`, `hmr`, `pure_define_element_calls`)
and computes the rest itself. That is why the module is 5,057 lines: it is
planning and emitting at once.

**The SSR emitter is embedded, not separate.** It shares `CodeWriter` and
`NameAllocator` with DOM emission but shares no semantics — which is why it is
a clean extraction candidate.

**Single-pass ordering is load-bearing.** NodeId order determines hydration
markers, and template interning depends on binding collection order. Any split
has to preserve the traversal order exactly, which is what the golden fixtures
verify.
