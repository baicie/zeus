import { signal } from '@zeus-js/core'

function App() {
  const count = signal(0)

  return (
    <>
      <h1>Vite + Solid</h1>
      <div class="card">
        <button
          onClick={() => {
            count(count() + 1)
            console.log(count())
          }}
        >
          count is {count()}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p class="read-the-docs">
        Click on the Vite and Solid logos to learn more
      </p>
    </>
  )
}

export default App
