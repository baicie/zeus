import { createSignal, Host, Slot, defineElement } from '@zeus-js/zeus'

defineElement(
  'z-counter',
  {
    shadow: false,
    props: {
      title: String,
    },
  },
  props => {
    const [count, setCount] = createSignal(0)

    return (
      <Host>
        <section>
          <h2>{props.title}</h2>

          <button onClick={() => setCount(count() + 1)}>
            count: {count()}
          </button>

          <Slot />
        </section>
      </Host>
    )
  },
)
