# Component Compiler Host Phase 5

## Goal

Introduce `@zeus-js/component-dts` as the shared dts generation layer, decoupling type generation from output plugins.

## Responsibilities

- Generate native Web Component declarations (`ZButtonElement`, `ZButtonEventMap`)
- Generate `HTMLElementTagNameMap` entries
- Generate JSX `IntrinsicElements`
- Generate typed `CustomEvent` maps
- Prepare React/Vue dts generators for wrapper outputs (Phase 6)

## Non-goals

- No React wrapper JS
- No Vue wrapper JS
- No full TS type-checker
- No shadcn-like registry

## Data source

All declarations are generated from `ComponentManifest` produced by `@zeus-js/component-analyzer`.

## Architecture

```
defineElement source
  └─ component-analyzer
       └─ ComponentManifest
            └─ component-dts
                 ├─ wc/*.d.ts      (per-component declarations)
                 ├─ wc/index.d.ts   (aggregated exports + HTMLElementTagNameMap)
                 ├─ wc/jsx.d.ts     (JSX IntrinsicElements)
                 ├─ react dts       (reserved for Phase 6)
                 └─ vue dts         (reserved for Phase 6)
```

## Package split

- `packages/component-dts` — pure generator, no Rollup/Vite/Rolldown dependency. Lives in `packages/_` because it is a core tool.
- `addons/output-wc` — output plugin that consumes `component-dts` and emits files to the bundle.

## Generated files

```txt
dist/wc/
  z-button.d.ts        (per-component, includes Element + EventMap + const declaration)
  z-card.d.ts
  index.d.ts           (export * + HTMLElementTagNameMap)
  jsx.d.ts             (JSX IntrinsicElements)
```

Phase 6 will use `generateReactDts`, `generateVueDts`, and `generateVueGlobalDts` to produce framework wrapper types.

## Usage

```ts
import { generateWCDtsFiles } from '@zeus-js/component-dts'

const files = generateWCDtsFiles(manifest, {
  outDir: 'wc',
  stripPrefix: 'z-',       // optional
  fileName: tag => tag,    // optional
  perComponent: true,
  index: true,
  jsx: true,
})
// files: DtsOutputFile[]
// [{ fileName: 'wc/z-button.d.ts', source: '...' }, ...]
```

## Type output examples

### Per-component d.ts

```ts
export interface ZButtonEventMap {
  press: CustomEvent<{ nativeEvent: MouseEvent }>
}

export interface ZButtonElement extends HTMLElement {
  variant?: 'default' | 'outline'
  disabled?: boolean
  addEventListener<K extends keyof ZButtonEventMap>(
    type: K,
    listener: (this: ZButtonElement, ev: ZButtonEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void
  removeEventListener<K extends keyof ZButtonEventMap>(
    type: K,
    listener: (this: ZButtonElement, ev: ZButtonEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void
}

export declare const ZButton: {
  new (): ZButtonElement
}
```

### index.d.ts

```ts
export * from './z-button'
export * from './z-card'

declare global {
  interface HTMLElementTagNameMap {
    'z-button': ZButtonElement
    'z-card': ZCardElement
  }
}
```

### jsx.d.ts

```ts
export interface ZButtonProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
  children?: unknown
  class?: string
  className?: string
  style?: string | Record<string, string | number | null | undefined>
  id?: string
  role?: string
  part?: string
  slot?: string
  [key: `data-${string}`]: unknown
  [key: `aria-${string}`]: unknown
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'z-button': ZButtonProps
    }
  }
}
```

## Output plugin integration

`@zeus-js/output-wc` delegates d.ts generation to `component-dts`:

```ts
if (normalized.dts || normalized.jsxDts) {
  const dtsFiles = generateWCDtsFiles(ctx.manifest, {
    outDir: normalized.outDir,
    stripPrefix: normalized.stripPrefix,
    fileName: normalized.fileName,
    perComponent: true,
    index: normalized.dts,
    jsx: normalized.jsxDts,
  })
  for (const file of dtsFiles) {
    files.push({
      type: 'asset',
      fileName: file.fileName,
      source: file.source,
    })
  }
}
```

## Future: Phase 6

Phase 6 will wire `generateReactDts` and `generateVueDts` into output plugins to emit framework wrapper types alongside WC types.
