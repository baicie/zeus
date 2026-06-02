import { defineElement, Host, Slot, state } from '@zeus-js/zeus'

import { isEnterOrSpace } from '../shared/keyboard'

export interface SwitchProps {
  checked?: boolean
  disabled?: boolean
}

function setup(
  props: SwitchProps,
  ctx: {
    emit: (event: string, detail: unknown) => void
    host: HTMLElement & { checked?: boolean }
  },
) {
  const checked = state(props.checked ?? false)

  const toggle = () => {
    if (props.disabled) return

    const next = !checked.value
    checked.value = next
    ctx.host.checked = next

    ctx.emit('checked-change', {
      checked: next,
    })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isEnterOrSpace(event)) return

    event.preventDefault()
    toggle()
  }

  return (
    <Host
      data-slot="switch"
      data-state={() => (checked.value ? 'checked' : 'unchecked')}
      data-disabled={() => (props.disabled ? '' : undefined)}
    >
      <button
        part="root"
        type="button"
        role="switch"
        disabled={Boolean(props.disabled)}
        aria-checked={checked.value ? 'true' : 'false'}
        aria-disabled={props.disabled ? 'true' : undefined}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span part="thumb" data-slot="switch-thumb" />
        <Slot />
      </button>
    </Host>
  )
}

export const ZSwitch = defineElement<SwitchProps>(
  'z-switch',
  {
    shadow: false,

    props: {
      checked: {
        type: Boolean,
        default: false,
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless switch primitive.',
      events: {
        'checked-change': {
          detail: {
            checked: 'boolean',
          },
        },
      },
      slots: {
        default: {
          description: 'Optional switch label.',
        },
      },
      cssParts: ['root', 'thumb'],
    },
  },
  setup,
)
