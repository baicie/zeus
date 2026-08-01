# Getting Started

## Create a Zeus app

```bash
pnpm create zeus
```

## Manual install

```bash
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/vite-plugin vite typescript
```

## Vite config

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

## TypeScript config

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"]
  }
}
```

## First component

```tsx
import { createSignal, render } from '@zeus-js/zeus'

function App() {
  const [count, setCount] = createSignal(0)

  return <button onClick={() => setCount(count() + 1)}>count: {count()}</button>
}

render(() => <App />, document.getElementById('root')!)
```
