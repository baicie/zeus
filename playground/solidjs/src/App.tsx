import { Show, createSignal } from 'solid-js'

function Child({ shouldError }: { shouldError: () => boolean }) {
  console.log('Child render')

  return (
    <Show
      when={shouldError()}
      fallback={
        <div>
          <h1>Child</h1>
        </div>
      }
    >
      <h1>Error</h1>
    </Show>
  )
}

function App() {
  const [count, setCount] = createSignal(0)
  const [shouldError, setShouldError] = createSignal(false)

  return (
    <>
      <section id="center">
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button class="counter" onClick={() => setCount(count => count + 1)}>
          Count is {count()}
        </button>
        <button
          class="counter"
          onClick={() => setShouldError(shouldError => !shouldError)}
        >
          Should Error is {shouldError() ? 'true' : 'false'}
        </button>
        <Child shouldError={shouldError} />
      </section>
    </>
  )
}

export default App
