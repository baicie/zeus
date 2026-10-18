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
event handlers. In side-effect mode (`register: 'side-effect'`), the plugin
also emits per-component element types and `wc/index.d.ts` exports them.

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
