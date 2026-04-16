import { createSignal } from '@zeusjs/zeus'

export function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <div>
      <h1>Counter Demo</h1>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>Increment</button>
      <button onClick={() => setCount(count() - 1)}>Decrement</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  )
}
