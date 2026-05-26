# Zeus

Compiler-first fine-grained UI framework.

```tsx
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>count: {count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```

## Features

- unified `state()` API
- object reactivity
- compiled JSX
- no Virtual DOM
- fine-grained DOM updates
- Web Components support

## Packages

- `@zeus-js/zeus` — unified entry point
- `@zeus-js/signal` — reactivity core
- `@zeus-js/runtime-dom` — DOM runtime helpers
- `@zeus-js/compiler` — JSX compiler
- `@zeus-js/vite-plugin` — Vite integration

## Quick Start

```bash
pnpm create zeus
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## Resources

- [Documentation](https://zeusjs.github.io)
- [API Reference](/api/zeus)
- [Contributing](/docs/contributing.md)

## License

MIT
