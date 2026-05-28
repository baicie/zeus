# Context

Sharing reactive state across the component tree with `createContext`, `inject` (aka `useContext`), and `<Context.Provider>`.

```tsx
import { createContext, inject } from '@zeus-js/runtime-dom'
import { state, render } from '@zeus-js/zeus'

const ThemeContext = createContext<{
  mode: 'light' | 'dark'
  toggle: () => void
}>()

function ThemedButton() {
  // inject() is the underlying function; useContext is a named alias.
  // Both share the same signature. The type argument is inferred from
  // the createContext call above.
  const theme = inject(ThemeContext) as { mode: string; toggle: () => void }

  return <button onClick={theme.toggle}>Theme: {theme.mode}</button>
}

function App() {
  const theme = state({
    mode: 'light' as const,
    toggle() {
      this.mode = this.mode === 'light' ? 'dark' : 'light'
    },
  })

  return (
    <ThemeContext.Provider value={theme}>
      <ThemedButton />
    </ThemeContext.Provider>
  )
}

render(() => <App />, document.getElementById('root')!)
```

This example also demonstrates:

- **Nested providers** — `ThemeContext.Provider` wrapping `UserContext.Provider`
- **Deeply nested consumers** — `DeepChild` reads context three levels down
- **Web Component bridge** — `<z-context-card>` consumes context through the DOM event protocol via `bridge` prop
- **`consumes`** — custom elements declare which contexts they need

## Key concepts

- `createContext` creates a typed context with an optional default value
- `inject(context)` reads the nearest provider in the owner tree
- `useContext` is a named alias for `inject`, matching the standard hook convention
- `<Context.Provider value={...}>` distributes context to descendants
- `provide` / `inject` — low-level alternatives to Provider/Hook style
- `<Context.Provider value={...} bridge>` bridges context across Web Component boundaries
- `defineElement` options: `consumes` array declares which contexts a custom element needs

## TypeScript note

Due to a known TypeScript limitation with `moduleResolution: "bundler"` in pnpm monorepo workspaces, `inject()` may not always infer the generic type parameter automatically. Use `as <Type>` to assert the expected type, or import and use `inject` from `@zeus-js/runtime-dom` directly.
