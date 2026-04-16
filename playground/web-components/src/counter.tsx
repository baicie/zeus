import { defineElement, createSignal } from '@zeusjs/zeus'

// Define a simple counter custom element
export default defineElement(
  'z-counter',
  {
    shadow: true,
    props: {
      initialCount: Number,
      step: Number,
    },
  },
  (props, host) => {
    const [count, setCount] = createSignal(props.initialCount ?? 0)
    const step = props.step ?? 1

    return (
      <Host>
        <div class="counter">
          <h2>Web Component Counter</h2>
          <p>Count: {count()}</p>
          <button onClick={() => setCount(c => c + step)}>Increment</button>
          <button onClick={() => setCount(c => c - step)}>Decrement</button>
        </div>
      </Host>
    )
  }
)

// Note: The component is registered when this module is imported
