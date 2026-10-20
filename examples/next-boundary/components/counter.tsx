/** @jsxImportSource @zeus-js/zeus */
import { defineElement, event, Host, prop, Slot } from '@zeus-js/zeus'

export const ZNextCounter = defineElement(
  'z-next-counter',
  {
    props: { count: prop(Number, { default: 0, reflect: true }) },
    emits: { valueChange: event<{ value: number }>() },
  },
  (props, { emit }) => (
    <Host>
      <button
        onClick={() => emit.valueChange({ value: (props.count ?? 0) + 1 })}
      >
        <Slot />: {props.count}
      </button>
    </Host>
  ),
)
