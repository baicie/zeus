# Context

Share values across the owner tree with `createContext`, `inject` (or `useContext`), and `<Context.Provider>`.

```tsx
import { createContext, inject } from '@zeus-js/runtime-dom'
import { createSignal, render } from '@zeus-js/zeus'

type Theme = {
  readonly mode: 'light' | 'dark'
  toggle(): void
}

const ThemeContext = createContext<Theme>()

function ThemedButton() {
  const theme = inject(ThemeContext)
  return <button onClick={theme.toggle}>Theme: {theme.mode}</button>
}

function App() {
  const [mode, setMode] = createSignal<'light' | 'dark'>('light')
  const theme: Theme = {
    get mode() {
      return mode()
    },
    toggle() {
      setMode(current => (current === 'light' ? 'dark' : 'light'))
    },
  }

  return (
    <ThemeContext.Provider value={theme}>
      <ThemedButton />
    </ThemeContext.Provider>
  )
}

render(() => <App />, document.getElementById('root')!)
```

## Web Component bridge

`<Context.Provider value={value} bridge>` exposes the same context through the DOM event protocol. A custom element declares the contexts it consumes with `defineElement({ consumes: [...] })`.

Context transports a value; it does not add reactivity by itself. Put changing fields behind signals or getters, as in the `Theme` example.
