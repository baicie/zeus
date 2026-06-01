/// <reference types="@zeus-js/zeus/jsx" />
/** @jsxImportSource @zeus-js/zeus */
import { defineElement, Host, Slot } from '@zeus-js/zeus'

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
    <Host>
      <button
        class={`btn btn-${props.variant}`}
        disabled={props.disabled}
        onClick={(event: MouseEvent) => emit('press', { nativeEvent: event })}
      >
        <Slot />
      </button>
    </Host>
  ),
)
