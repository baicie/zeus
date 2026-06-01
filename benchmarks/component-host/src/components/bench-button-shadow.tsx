// benchmarks/component-host/src/components/bench-button-shadow.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface BenchButtonShadowProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
}

export const ZBenchButtonShadow = defineElement<BenchButtonShadowProps>(
  'z-bench-button-shadow',
  {
    shadow: true,

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
      description: 'Benchmark button component (Shadow DOM).',
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

      emit('press', {
        nativeEvent: event,
      })
    }

    return (
      <Host
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
