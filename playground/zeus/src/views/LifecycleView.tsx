import { onCleanup, onMount, onUnmount, signal } from '@zeus-js/core'

function LifecycleView() {
  const count = signal(0)

  onMount(() => {
    console.log('onMount')
  })
  onCleanup(() => {
    console.log('onCleanup')
  })
  onUnmount(() => {
    console.log('onUnmount')
  })

  return (
    <div>
      <h1>Lifecycle View</h1>
      <p>Count: {count()}</p>
      <button onClick={() => count(count() + 1)}>Increment</button>
    </div>
  )
}

export default LifecycleView
