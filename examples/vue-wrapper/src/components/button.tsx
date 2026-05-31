import { defineElement, Slot } from '@zeus-js/zeus'

export interface ButtonProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
}

export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
  },
  (props, { emit }) => (
    <button
      class={`btn btn-${props.variant}`}
      disabled={props.disabled}
      onClick={event => emit('press', { nativeEvent: event })}
    >
      <Slot />
    </button>
  ),
)
