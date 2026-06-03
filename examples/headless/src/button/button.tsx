import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface ButtonProps {
  variant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'secondary'
    | 'destructive'
    | 'link'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  disabled?: boolean
}

function setup(
  props: ButtonProps,
  ctx: { emit: (event: string, detail: unknown) => void },
) {
  const handleClick = (event: MouseEvent) => {
    if (props.disabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    ctx.emit('press', {
      nativeEvent: event,
    })
  }

  return (
    <Host
      data-slot="button"
      data-variant={() => props.variant}
      data-size={() => props.size}
      data-disabled={() => (props.disabled ? '' : undefined)}
    >
      <button
        part="root"
        type="button"
        disabled={() => Boolean(props.disabled)}
        aria-disabled={() => (props.disabled ? 'true' : undefined)}
        onClick={handleClick}
      >
        <Slot />
      </button>
    </Host>
  )
}

export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    shadow: false,

    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
      size: {
        type: String,
        default: 'md',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless button primitive.',
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
  setup,
)
