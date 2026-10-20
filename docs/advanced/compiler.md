# Compiler Internals

## Overview

Zeus uses a multi-stage compiler pipeline:

```
JSX → AST → IR → DOM codegen
```

## Stages

### 1. Parser

The Rust compiler uses OXC to parse TypeScript and JSX and resolve lexical
bindings. The Node adapter is `@zeus-js/compiler-native`; `@zeus-js/compiler`
provides the public compiler entry.

### 2. Lowering

The AST is lowered into Zeus Intermediate Representation (IR):

- `ElementIR` — DOM elements
- `ComponentIR` — Zeus components
- `ForIR` — For loops with optional `by`
- `ShowIR` — Conditional rendering
- `DynamicTextIR` — Reactive text
- `EventBindingIR` — Event handlers

### 3. Codegen

IR nodes are transformed into DOM runtime helper calls:

```ts
template('<button><!></button>')
bindText(textNode, () => count())
bindEvent(button, 'click', handler)
```

## Static Template Cloning

Static HTML is extracted into cached templates. The compiler emits clone calls:

```ts
const button = templateFactory()
```

The template factory clones cached static HTML during component initialization.
The component initializes once; later Signal updates write only the affected
bindings. The same semantic IR also supports the string-producing SSR target.

## Hot Module Replacement

The Vite integration treats a module with a direct top-level `render()` call as
an HMR boundary. Before Vite replaces the module, Zeus disposes the old render
root and all owned effects, listeners, refs, and cleanup callbacks. The updated
module then mounts a fresh root.

Executable updates reset local signals and create new DOM nodes. Ordinary
comment edits skip invalidation only when all other source bytes, comment line
terminators and compiler directives remain unchanged; existing roots and DOM
then retain their identity. Compiler directive edits such as `@once` recompile
and report new diagnostics. The HMR classifier uses TS/JSX parser comment ranges,
preserves template and JSX text, and recompiles on parse failure. Component modules without a render root continue
to propagate executable updates to their nearest accepted root boundary.
