import { signal } from '@zeus-js/core'

// signal 必须在组件外部创建，否则每次重渲染都会重置
const count = signal(0)

function App() {
  return (
    <>
      <h1>Vite + Zeus</h1>
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
      <p class="read-the-docs">Click on the Zeus logos to learn more</p>
    </>
  )
}

export default App
