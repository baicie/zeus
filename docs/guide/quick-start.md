# Quick Start

Build Web Components once, use them from the browser, React, and Vue.

## Install

Run `pnpm create zeus` and choose the **Component Library TypeScript** template.
The generated project includes Zeus, the Web-C Vite adapter, TypeScript, and
build, check, and test scripts.

## Create a component

Save this as `src/components/greeting.tsx`:

```tsx
import { defineElement, Host, Slot } from '@zeus-js/zeus'

export const ZGreeting = defineElement(
  'z-greeting',
  {
    shadow: false,
    props: {
      name: String,
    },
  },
  props => (
    <Host data-component="greeting">
      <p part="label">Hello, {String(props.name ?? 'World')}!</p>
      <Slot />
    </Host>
  ),
)
```

## Configure Vite

The generated `vite.config.ts` uses the public Web-C Vite entry:

```ts
import zeus, { componentLibrary } from '@zeus-js/web-c/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      plugins: componentLibrary(),
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
    },
  },
})
```

The `@zeus-js/web-c/vite` adapter compiles Zeus components and combines the
Web Component, React, and Vue outputs. `pnpm build` writes them to `dist/`,
along with `custom-elements.json` and `zeus.components.json`.

The generated entry point is saved as `src/index.ts`:

```ts
import './styles.css'

export { ZGreeting } from './components/greeting'
```

The template also includes `src/styles.css`:

```css
:host {
  font-family: system-ui, sans-serif;
}

[data-component='greeting'] {
  color: #334155;
}
```

## Use it

Import the generated lazy auto entry in a consuming application, then use
`<z-greeting name="World">Hello from a slot</z-greeting>` in its HTML.

```ts
import './dist/wc/auto.js'
```

## Next steps

- [Web Components](/guide/web-components) — deep dive into `defineElement`, `Host`, and `Slot`
- [React](/guide/react) — consume the generated React wrapper
- [Vue](/guide/vue) — consume the generated Vue wrapper
- [Registry](/guide/registry) — use the component registry CLI
