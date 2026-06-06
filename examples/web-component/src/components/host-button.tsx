import { defineElement, event, Host, prop, Slot } from '@zeus-js/zeus'

export interface HostButtonProps {
  [key: string]: unknown
  variant?: 'default' | 'outline'
  size?: 'sm' | 'md'
  disabled?: boolean
}

export const ZHostButton = defineElement<HostButtonProps>(
  'z-host-button',
  {
    shadow: false,
    props: {
      variant: prop(['default', 'outline'], {
        default: 'default',
        reflect: true,
      }),
      size: prop(['sm', 'md'], {
        default: 'md',
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
  (props, { emit }) => {
    return (
      <Host
        data-slot="button"
        data-variant={props.variant}
        data-size={props.size}
        data-disabled={props.disabled ? '' : undefined}
        class={[
          'z-host-button',
          `z-host-button-${props.variant}`,
          `z-host-button-${props.size}`,
          props.disabled && 'is-disabled',
        ]}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <button
          type="button"
          disabled={props.disabled}
          onClick={event => {
            if (props.disabled) return

            emit.press({
              nativeEvent: event,
            })
          }}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
