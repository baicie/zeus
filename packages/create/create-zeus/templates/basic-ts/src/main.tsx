import { createSignal, render } from '@zeus-js/zeus'

function App() {
  const [count, setCount] = createSignal(0)

  return (
    <main>
      <h1>Zeus</h1>

      <button onClick={() => setCount(count() + 1)}>count: {count()}</button>
    </main>
  )
}

render(() => <App />, document.getElementById('root')!)
