import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { bindBooleanProp, bindOptionalAttr } from '../shared/dom'
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
  let button!: HTMLButtonElement

  const toggle = () => {
    if (props.disabled) return

    const next = !props.checked

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

  const bindButton = (el: HTMLButtonElement | null) => {
    if (!(el instanceof HTMLButtonElement)) return

    button = el
    bindOptionalAttr(button, 'aria-checked', () =>
      props.checked ? 'true' : 'false',
    )
    bindOptionalAttr(button, 'aria-disabled', () =>
      props.disabled ? 'true' : undefined,
    )
    bindBooleanProp(button, 'disabled', () => Boolean(props.disabled))
  }

  return (
    <Host
      data-slot="switch"
      data-state={() => (props.checked ? 'checked' : 'unchecked')}
      data-disabled={() => (props.disabled ? '' : undefined)}
    >
      <button
        ref={bindButton}
        part="root"
        type="button"
        role="switch"
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
