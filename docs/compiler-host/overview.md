# Web-C Component Build

`@zeus-js/web-c` is the public build entry for turning Zeus component source
into Web Component, React, and Vue outputs. Its Vite, Rollup, and Rolldown
subpaths provide the matching bundler adapter; `@zeus-js/vite-plugin` remains
the application entry for compiling Zeus Native TSX.

## Architecture

```
defineElement source
  │
  ▼
@zeus-js/web-c
  │
  ▼
component analyzer → component manifest
  │
  ▼
bundler adapter + output plugins
  │
  ▼
┌──────────────────┬──────────────────┬──────────────────┐
│ Web Components   │ React wrappers   │ Vue wrappers     │
└──────────────────┴──────────────────┴──────────────────┘
```

## Public entry points

| Entry point               | Use it for                                  |
| ------------------------- | ------------------------------------------- |
| `@zeus-js/web-c`          | Output plugins and component-library preset |
| `@zeus-js/web-c/vite`     | Vite component-library builds               |
| `@zeus-js/web-c/rollup`   | Rollup component-library builds             |
| `@zeus-js/web-c/rolldown` | Rolldown component-library builds           |
| `@zeus-js/vite-plugin`    | Zeus Native application TSX compilation     |

```ts
import zeus, { componentLibrary } from '@zeus-js/web-c/vite'

zeus({ plugins: componentLibrary() })
```

The lower-level analyzer, bundler host, and output packages are implementation
dependencies of the public Web-C entry. Install those packages directly only
when building an integration around their individual contracts.

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
