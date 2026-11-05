import { Host, Slot, createSignal, defineElement } from '@zeus-js/zeus'

defineElement(
  'z-host-counter',
  {
    shadow: false,
    props: {
      count: Number,
      label: String,
    },
  },
  (props: { count?: number; label?: string }) => {
    const [count, setCount] = createSignal(props.count ?? 0)
    return (
      <Host>
        <button type="button" onClick={() => setCount(count() + 1)}>
          {props.label ?? 'Host'}: {count()}
        </button>
        <Slot />
      </Host>
    )
  },
)
