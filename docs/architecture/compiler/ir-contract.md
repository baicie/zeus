# Rust / TypeScript IR Contract Matrix

There are two IR definitions in this repository:

- `crates/zeus_compiler/src/ir.rs` — 35 types, consumed by the Rust compiler
- `packages/compiler/compiler-shared/src/nodes.ts` — 36 types, with **no source
  consumer in the workspace**

This document records what they actually are, rather than assuming they are two
views of one contract. They are not: they model different stages, and one of
them is unused.

---

## Matrix

| Concept          | Rust representation                                                                                       | TS representation                              | Actual consumer         | Semantic difference                                                                | Canonical owner | Decision        |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- | --------------- | --------------- |
| Module           | `ModuleIr`                                                                                                | `ProgramIR`                                    | Rust codegen            | Rust has `components` and `roots`; TS has `body`                                   | Rust            | keep parallel   |
| Component        | `ComponentIr`                                                                                             | `ComponentIR`                                  | Rust codegen            | Rust carries `setup` and `props`; TS carries `host`                                | Rust            | keep parallel   |
| Root             | `RootIr` (enum: Element / Component / Show / For / Transition / ErrorBoundary / Fragment / DynamicRegion) | no equivalent                                  | Rust lowering + codegen | TS has no root concept at all                                                      | Rust            | Rust-only       |
| Element          | `ElementIr`                                                                                               | `ElementIR`                                    | Rust lowering + codegen | TS has `domPath`; Rust derives the path during emission                            | Rust            | keep parallel   |
| Host             | **no node** — lowered to `RootIr::Component` at `lower.rs:503`                                            | `HostIR`                                       | none                    | TS models Host as a node; Rust resolves it at compile time into a root             | Rust            | **TS is stale** |
| Slot             | **no node** — lowered to a component                                                                      | `SlotIR`                                       | none                    | same as Host                                                                       | Rust            | **TS is stale** |
| DOM path         | **not in IR** — computed by `emit_element_targets` from the template                                      | `DomPath` / `PhysicalDomPath` on every element | none                    | TS stores a path the Rust emitter derives; two sources of truth for the same value | Rust            | **TS is stale** |
| Text             | `TextIr`                                                                                                  | `TextIR`                                       | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Dynamic text     | `DynamicTextIr`                                                                                           | `DynamicTextIR`                                | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Dynamic region   | `DynamicRegionIr` + 2 expression variants                                                                 | no equivalent                                  | Rust lowering + codegen | TS has no region concept                                                           | Rust            | Rust-only       |
| Attribute        | `AttributeIr` (enum)                                                                                      | `AttributeIR` (union)                          | Rust lowering + codegen | equivalent                                                                         | Rust            | keep parallel   |
| Static attribute | `StaticAttributeIr`, `StaticAttributeValue`                                                               | `StaticAttributeIR`                            | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Attr binding     | `AttrBindingIr`                                                                                           | `AttrBindingIR`                                | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Prop binding     | `PropBindingIr`                                                                                           | `PropBindingIR`                                | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Event binding    | `EventBindingIr`                                                                                          | `EventBindingIR`                               | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Ref binding      | `RefBindingIr`                                                                                            | `RefBindingIR`                                 | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Spread           | `SpreadBindingIr`                                                                                         | `SpreadBindingIR`                              | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Show             | `ShowBindingIr`                                                                                           | `ShowIR`                                       | Rust codegen            | TS carries children as `nodes`; Rust as `children`                                 | Rust            | keep parallel   |
| For              | `ForBindingIr`                                                                                            | `ForIR`                                        | Rust codegen            | same shape difference as Show                                                      | Rust            | keep parallel   |
| ErrorBoundary    | `ErrorBoundaryBindingIr`, `ErrorBoundaryFallbackIr`                                                       | `ErrorBoundaryIR`                              | Rust codegen            | TS has one fallback type                                                           | Rust            | keep parallel   |
| Transition       | `TransitionBindingIr`, `TransitionOptionIr`                                                               | `TransitionIR`, `TransitionOptionIR`           | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Expression       | `ExpressionIr`                                                                                            | `ExpressionIR`                                 | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Expression form  | `ExpressionForm`                                                                                          | `ExpressionForm`                               | Rust codegen            | equivalent                                                                         | Rust            | keep parallel   |
| Child            | `ChildIr` (enum)                                                                                          | no equivalent                                  | Rust lowering + codegen | TS has no unified child union                                                      | Rust            | Rust-only       |
| Node id          | `NodeId` (u32)                                                                                            | no equivalent                                  | Rust lowering + codegen | hydration markers derive from it                                                   | Rust            | Rust-only       |
| Span             | `SourceSpan`, `SourcePosition`                                                                            | `SourceSpan`, `SourcePosition`                 | both                    | equivalent                                                                         | shared          | keep parallel   |

Naming differs only by case convention (`IR` vs `Ir`), which is each language's
idiom and not a semantic difference.

---

## What the audit found

**1. The TypeScript IR has no consumer.** A workspace-wide search for
`from '@zeus-js/compiler-shared'` in `packages/`, `scripts/` and `examples/`
returns nothing. The package is referenced only by build configuration
(`tsconfig.build.json`, `scripts/build-and-link.ts`, the release group list). It
is built and published, and nothing imports it.

**2. Three of its concepts are actively wrong.** `HostIR`, `SlotIR` and
`DomPath` describe a compiler that no longer exists:

- Rust resolves `<Host>` and `<Slot>` during lowering into roots and
  components (`lower.rs:503`, `513`). There is no Host or Slot node in the
  output IR, because by the time the IR exists the question is already decided.
- `DomPath` is not stored in the Rust IR at all: the template renderer assigns
  positions while building the HTML, and `emit_element_targets` reads them back
  from there. A `domPath` field on the IR would be a second source of truth for
  a value that must match the template exactly.

**3. The remaining concepts are genuinely parallel.** For the types both sides
define, the semantics match. They differ in whether the IR is _fully resolved_
(Rust) or _descriptive_ (TS).

**4. Rust is the canonical owner of compilation semantics.** The Rust IR is
what the compiler actually consumes, and `crates/zeus_compiler` is the only
thing that lowers, analyses or emits.

---

## Decision

**Do not delete `compiler-shared` in this change.** Two reasons:

1. It is a published package in the 32-package release group, and R17.0 is a
   compiler refactor — removing a published npm package is a release decision
   with its own coordination, not a side effect.
2. The R16.0 branch moves it to `packages/compiler/compiler-shared`. A deletion
   now would conflict with that in-flight work.

**Do not make it match the Rust IR either.** Generating TS types from Rust
would create a coupling that has to be maintained for a type set nobody
consumes. Making a dead contract consistent is not an improvement.

**Record the intent instead.** The package's own description says "Babel-
independent Zeus compiler IR contracts". That was true when a TypeScript
compiler existed. The correct next step is a separate decision:

- retire `compiler-shared` from the release group, or
- repurpose it as a _published_ IR contract with a real consumer
  (e.g. a Playground inspector or a tooling integration), at which point it
  should be generated from the Rust IR rather than hand-maintained.

Until that decision, this document is the honest statement: the two IRs are
not one contract, Rust owns compilation semantics, and the TS side is stale
for Host/Slot/DomPath specifically.

---

## Serialization consistency

There is one place where the two IRs must agree, and it is tested: the
canonical fixture.

`crates/zeus_compiler/tests/ir.rs` reads
`packages/compiler/compiler-shared/fixtures/attribute-bindings.json` and asserts
that Rust can deserialize it and re-serialize it to the same JSON. That is a
real equivalence test for the attribute union — the one concept both sides
define identically and serialize.

The `error-boundary.json` fixture is read only by the TS package's own test,
which is another sign the TS side tests itself rather than the compiler.

---

## What this means for future work

- New compilation semantics go in the Rust IR. `compiler-shared` does not need
  a matching field.
- If a TypeScript tool needs the IR, generate the types from Rust rather than
  hand-writing them — the case naming is mechanical and the drift above is what
  hand-maintenance produced.
- The fixture under `compiler-shared/fixtures/` is load-bearing for the Rust
  tests even though the package around it is not. If the package is retired,
  the fixture moves into `crates/zeus_compiler/tests/fixtures/` in the same
  change.
