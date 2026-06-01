# Component DTS

Generate TypeScript declaration files for component props and events.

## Options

```ts
interface OutputDtsOptions {
  /** Output directory for .d.ts files */
  outDir: string

  /** Include or exclude specific components */
  filter?: (component: ComponentEntry) => boolean
}
```

## Usage

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin/vite'
import wc from '@zeus-js/output-wc/vite'
import dts from '@zeus-js/component-dts/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: { include: ['src/components/**/*.ts'] },
      outputs: [wc({ outDir: 'dist/wc' }), dts({ outDir: 'dist/wc' })],
    }),
  ],
})
```

## Generated output

For each component:

```ts
// dist/wc/z-button.d.ts

import type { CustomElement } from '@zeus-js/zeus'

export interface ButtonProps {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  disabled?: boolean
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'z-button': CustomElement<ButtonProps> & {
        onpress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void
      }
    }
  }
}

export const ZButton: (
  props: ButtonProps & {
    onpress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void
    children?: any
  },
) => HTMLElement
```

## Global types

The DTS output also writes a `global.d.ts` that extends `HTMLElementTagNameMap`:

```ts
// dist/wc/global.d.ts

declare global {
  interface HTMLElementTagNameMap {
    'z-button': HTMLZButtonElement
    'z-card': HTMLZCardElement
    'z-dialog': HTMLZDialogElement
  }
}
```
