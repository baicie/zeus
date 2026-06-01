import { Host, Slot, defineElement, state } from '@zeus-js/zeus'

defineElement(
  'z-counter',
  {
    shadow: false,
    props: {
      title: String,
    },
  },
  props => {
    const count = state(0)

    return (
      <Host>
        <section>
          <h2>{props.title}</h2>

          <button onClick={() => count.value++}>count: {count.value}</button>

          <Slot />
        </section>
      </Host>
    )
  },
)
