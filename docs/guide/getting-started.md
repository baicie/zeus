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
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>count: {count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```
