import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { bindBooleanProp, bindOptionalAttr } from '../shared/dom'

export interface ButtonProps {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

function setup(
  props: ButtonProps,
  ctx: { emit: (event: string, detail: unknown) => void },
) {
  let button!: HTMLButtonElement

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

  const bindButton = (el: HTMLButtonElement | null) => {
    if (!(el instanceof HTMLButtonElement)) return

    button = el
    bindBooleanProp(button, 'disabled', () => Boolean(props.disabled))
    bindOptionalAttr(button, 'aria-disabled', () =>
      props.disabled ? 'true' : undefined,
    )
  }

  return (
    <Host
      data-slot="button"
      data-variant={() => props.variant}
      data-size={() => props.size}
      data-disabled={() => (props.disabled ? '' : undefined)}
    >
      <button ref={bindButton} part="root" type="button" onClick={handleClick}>
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
