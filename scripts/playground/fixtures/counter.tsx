import { createSignal } from '@zeus-js/signal'

export const Counter = () => {
  const [count, setCount] = createSignal(0)

  return (
    <button type="button" onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
  )
}
