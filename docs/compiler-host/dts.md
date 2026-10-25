# Component DTS

Generate TypeScript declaration files for component props and events.

## Options

Declaration files are enabled by the Web Component output plugin with its
`dts` and `jsxDts` options.

## Usage

```ts
import { defineConfig } from 'vite'
import zeus, { wc } from '@zeus-js/web-c/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: { include: ['src/components/**/*.ts'] },
      plugins: [
        wc({
          outDir: 'wc',
          dts: true,
          jsxDts: true,
        }),
      ],
    }),
  ],
})
```

## Generated output

With the default lazy loader, the output includes `wc/loader.d.ts`,
`wc/index.d.ts`, `wc/types/jsx.d.ts`, and one small declaration per component:

```ts
// dist/wc/loader.d.ts
export declare function defineCustomElement(
  tagName: string,
  options?: { registry?: CustomElementRegistry },
): void
export declare function defineCustomElements(options?: {
  registry?: CustomElementRegistry
}): void

// dist/wc/z-button.d.ts
export declare function defineCustomElement(options?: {
  registry?: CustomElementRegistry
}): void
```

`wc/types/jsx.d.ts` extends the Zeus JSX namespace with component props and
event handlers. When `jsxDts` is enabled, the loader and index declarations
reference it, so importing a package entry whose `types` points to
`wc/index.d.ts` also activates its JSX contract. Side-effect mode
(`register: 'side-effect'`) uses `wc/jsx.d.ts` in the same way. Disabling
`jsxDts` omits that reference.

Both modes export each component's element type and event map from
`wc/index.d.ts`. Event map keys use the declared DOM event names; required
and optional detail fields follow the analyzer's event schema. Element
`addEventListener` and `removeEventListener` infer those event payloads while
retaining standard `HTMLElement` event listeners. For example, a component
named `ZNotice` with a `row-change` event exports `ZNoticeElement` and
`ZNoticeEventMap`:

```ts
import type { ZNoticeEventMap } from '@example/notices/wc'

const payload: ZNoticeEventMap['row-change']['detail'] = { rowId: 'row-1' }
```

The package must export that entry with its generated declaration path;
consumers do not need to import a private `dist` declaration file. Component
schemas also take precedence over common JSX attributes such as `id`, so a
schema can make that attribute required.

The loader declaration adds component types to `HTMLElementTagNameMap`:

```ts
// dist/wc/loader.d.ts

declare global {
  interface HTMLElementTagNameMap {
    'z-button': ZButtonElement
    'z-card': ZCardElement
    'z-dialog': ZDialogElement
  }
}
```
