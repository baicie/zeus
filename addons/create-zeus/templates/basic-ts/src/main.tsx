import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return (
    <main>
      <h1>Zeus</h1>

      <button onClick={() => count.value++}>count: {count.value}</button>
    </main>
  )
}

render(() => <App />, document.getElementById('root')!)
