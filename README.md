# Zeus

Compiler-first fine-grained UI framework.

```tsx
import { createSignal, render } from '@zeus-js/zeus'

function App() {
  const [count, setCount] = createSignal(0)

  return <button onClick={() => setCount(count() + 1)}>count: {count()}</button>
}

render(() => <App />, document.getElementById('root')!)
```

## Features

- explicit getter/setter signals
- compiled JSX and direct DOM updates
- no Virtual DOM or component rerender loop
- owned cleanup for dynamic subtrees
- Web Components with `Host` and `Slot`

## Packages

- `@zeus-js/zeus` - application entry point
- `@zeus-js/signal` - public reactive primitives
- `@zeus-js/runtime-dom` - compiler-targeted DOM runtime
- `@zeus-js/compiler` - JSX compiler
- `@zeus-js/vite-plugin` - Vite integration

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
