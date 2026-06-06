import { defineElement, event, Host, prop, Slot } from '@zeus-js/zeus'

import type { DefineElementContext, EventDefinition } from '@zeus-js/zeus'

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

type ButtonEmits = {
  press: EventDefinition<{ nativeEvent: MouseEvent }>
}

function setup(
  props: ButtonProps,
  ctx: DefineElementContext<HTMLElement, ButtonEmits>,
) {
  const handleClick = (event: MouseEvent) => {
    if (props.disabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    ctx.emit.press({
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

export const ZButton = defineElement<ButtonProps, HTMLElement, ButtonEmits>(
  'z-button',
  {
    shadow: false,

    props: {
      variant: prop(
        ['default', 'outline', 'ghost', 'secondary', 'destructive', 'link'],
        {
          default: 'default',
          reflect: true,
        },
      ),
      size: prop(['sm', 'md', 'lg', 'icon'], {
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

    meta: {
      description: 'Headless button primitive.',
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
