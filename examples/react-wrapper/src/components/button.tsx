/// <reference types="@zeus-js/zeus/jsx" />
/** @jsxImportSource @zeus-js/zeus */
import { defineElement, event, Host, prop, Slot } from '@zeus-js/zeus'

export interface ButtonProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
}

export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    props: {
      variant: prop(['default', 'outline'], {
        default: 'default',
        reflect: true,
      }),
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
    emits: {
      press: event<{ nativeEvent: MouseEvent }>(),
    },
  },
  (props, { emit }) => (
    <Host>
      <button
        class={`btn btn-${props.variant}`}
        disabled={props.disabled}
        onClick={(event: MouseEvent) => emit.press({ nativeEvent: event })}
      >
        <Slot />
      </button>
    </Host>
  ),
)
