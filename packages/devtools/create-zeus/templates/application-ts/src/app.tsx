import { createSignal } from '@zeus-js/zeus'

export function App() {
  const [count, setCount] = createSignal(0)

  return (
    <main>
      <h1>Zeus Application</h1>
      <p>Start building your fine-grained application here.</p>
      <button onClick={() => setCount(count() + 1)}>
        interactions: {count()}
      </button>
    </main>
  )
}
