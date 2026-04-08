import { signal } from '@zeus-js/core'

export default function CounterView() {
  const count = signal(0)

  return (
    <section class="card">
      <h2>Counter</h2>
      <p>count: {count()}</p>
      <div class="row">
        <button onClick={() => count(count() - 1)}>-1</button>
        <button onClick={() => count(0)}>reset</button>
        <button onClick={() => count(count() + 1)}>+1</button>
      </div>
    </section>
  )
}
