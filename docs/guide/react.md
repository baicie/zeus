# React

Generate React wrappers from Web Component sources.

## Install

```bash
pnpm add @zeus-js/zeus @zeus-js/web-c
pnpm add -D vite typescript
```

## Configure

```ts
import { defineConfig } from 'vite'
import zeus, { componentLibrary } from '@zeus-js/web-c/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      plugins: componentLibrary({
        targets: ['wc', 'react'],
      }),
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
