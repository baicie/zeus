import { signal } from '@zeus-js/core'
import styles from './App.module.css'

function App() {
  const count = signal(0)
  return (
    <>
      <h1 style={{ color: 'red' }}>Vite + Zeus</h1>
      <div class="card" className={styles.card}>
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
