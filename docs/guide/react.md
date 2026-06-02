# React

Generate React wrappers from Web Component sources.

## Install

```bash
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/vite-plugin @zeus-js/output-wc @zeus-js/output-react-wrapper
```

## Configure

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin/vite'
import wc from '@zeus-js/output-wc/vite'
import react from '@zeus-js/output-react-wrapper/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [wc({ outDir: 'dist/wc' }), react({ outDir: 'dist/react' })],
    }),
  ],
})
```

## Use generated wrapper

```tsx
import { ZButton } from './dist/react'

export function App() {
  return (
    <ZButton
      variant="outline"
      onPress={event => {
        console.log(event.detail)
      }}
    >
      Button
    </ZButton>
  )
}
```

React wrappers use DOM property sync and native `addEventListener` internally, so boolean/object props and `CustomEvent` are handled consistently.

## TypeScript

Add the generated type declarations to your `tsconfig.json` include:

```json
{
  "compilerOptions": {
    "types": ["./dist/react"]
  }
}
```
