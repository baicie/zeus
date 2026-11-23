// benchmarks/component-host/src/components/bench-button.tsx

import { defineElement, event, Host, Slot } from '@zeus-js/zeus'

export interface BenchButtonProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
}

export const ZBenchButton = defineElement<BenchButtonProps>(
  'z-bench-button',
  {
    shadow: false,
    emits: {
      press: event<{ nativeEvent: MouseEvent }>(),
    },

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

    meta: {
      description: 'Benchmark button component.',
      events: {
        press: {
          detail: {
            nativeEvent: 'MouseEvent',
          },
        },
      },
      slots: {
        default: {
          description: 'Button content.',
        },
      },
      cssParts: ['root'],
    },
  },

  (props, { emit }) => {
    const onClick = (event: MouseEvent) => {
      if (props.disabled) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      emit.press({
        nativeEvent: event,
      })
    }

    return (
      <Host
        data-slot="bench-button"
        data-variant={props.variant}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button
          part="root"
          type="button"
          disabled={props.disabled}
          onClick={onClick}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
