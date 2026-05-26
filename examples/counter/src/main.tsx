import { render, state } from '@zeus-js/zeus'

function Counter() {
  const count = state(0)

  return (
    <div class="card">
      <h1>Counter</h1>
      <div class="count">{count.value}</div>
      <div class="buttons">
        <button onClick={() => count.value--}>-</button>
        <button onClick={() => count.value++}>+</button>
      </div>
    </div>
  )
}

render(() => <Counter />, document.getElementById('root')!)
