# Compiler Internals

## Overview

Zeus uses a multi-stage compiler pipeline:

```
JSX → AST → IR → DOM codegen
```

## Stages

### 1. Parser

Babel parses JSX into an AST.

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
_h(tagName, ...children)
text(value)
_bindEvent(el, event, handler)
```

## Static Template Cloning

Static HTML is extracted into cached templates. The compiler emits clone calls:

```ts
const _t$1 = _clone(_tmpl$1)
```

This avoids recreating static DOM nodes on each render.

## Hot Module Replacement

In dev mode, the compiler preserves state across reloads by reusing DOM elements.
