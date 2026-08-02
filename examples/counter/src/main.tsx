import { createSignal, render } from '@zeus-js/zeus'

function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <div class="card">
      <h1>Counter</h1>
      <div class="count">{count()}</div>
      <div class="buttons">
        <button onClick={() => setCount(count() - 1)}>-</button>
        <button onClick={() => setCount(count() + 1)}>+</button>
      </div>
    </div>
  )
}

render(() => <Counter />, document.getElementById('root')!)
