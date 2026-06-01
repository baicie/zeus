# Component Compiler Host

The Component Compiler Host is the build-time layer that turns Zeus Web Component source into multiple outputs.

## Architecture

```
defineElement source
  │
  ▼
component-analyzer
  │
  ▼
ComponentManifest
  │
  ▼
bundler-plugin
  │
  ▼
┌───────────────┬─────────────────┬──────────────┐
│  output-wc    │ output-react    │ output-vue   │
│               │ output-icons    │              │
└───────────────┴─────────────────┴──────────────┘
```

## Packages

| Package | Description |
|---|---|
| `@zeus-js/component-analyzer` | Extracts manifest from `defineElement` source |
| `@zeus-js/component-dts` | Generates `.d.ts` for component props and events |
| `@zeus-js/bundler-plugin` | Vite plugin host for component analysis |
| `@zeus-js/output-wc` | Emits native Web Component files |
| `@zeus-js/output-react-wrapper` | Generates React wrapper components |
| `@zeus-js/output-vue-wrapper` | Generates Vue 3 wrapper components |
| `@zeus-js/output-icons` | Extracts and emits zero-runtime SVG icons |

## Source of truth

`defineElement` is the single source of truth.

```tsx
export const ZButton = defineElement('z-button', options, setup)
```

The analyzer extracts:

- `tag` — custom element tag name
- `props` — declared props with types, defaults, and reflection settings
- `events` — declared events with detail types
- `slots` — declared slots (named and default)
- `host attributes` — `data-*` attributes set on Host
- `css parts` — exposed shadow DOM parts
- `css variables` — exposed custom CSS properties

Outputs consume the manifest and generate framework-specific artifacts.
