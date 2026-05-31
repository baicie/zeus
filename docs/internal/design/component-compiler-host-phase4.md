# Component Compiler Host Phase 4

## Goal

Implement `@zeus-js/output-wc`, the first official output plugin for Zeus Component Compiler Host.

## Responsibilities

- Generate per-component Web Component entries
- Generate `wc/index.js`
- Generate Zeus ComponentManifest JSON
- Generate `custom-elements.json`
- Generate basic native Web Component d.ts

## Non-goals

- No React wrapper
- No Vue wrapper
- No shadcn-like registry
- No full cross-framework dts

## Entry generation

The component source owns registration:

```tsx
export const ZButton = defineElement('z-button', options, setup)
```

`output-wc` only generates:

```ts
import { ZButton } from '/absolute/path/src/button.tsx'

export { ZButton }
```

Importing this module triggers `defineElement()` and registers the custom element.

## sideEffects

Generated Web Component entries are side-effect modules.

Component library packages should configure:

```json
{
  "sideEffects": ["dist/wc/*.js", "dist/wc/**/*.js", "**/*.css"]
}
```

## Output

```txt
dist/
  wc/
    z-button.js
    index.js
    index.d.ts
    jsx.d.ts
  zeus.components.json
  custom-elements.json
```
