import { defineElement, event, Host, Slot } from '@zeus-js/zeus'

import { isEnterOrSpace } from '../shared/keyboard'

import type { DefineElementContext, EventDefinition } from '@zeus-js/zeus'

export interface SwitchProps {
  checked?: boolean
  disabled?: boolean
}

type SwitchEmits = {
  checkedChange: EventDefinition<{ checked: boolean }>
}

function setup(
  props: SwitchProps,
  ctx: DefineElementContext<HTMLElement & { checked?: boolean }, SwitchEmits>,
) {
  const toggle = () => {
    if (props.disabled) return

    const next = !props.checked
    ctx.host.checked = next

    ctx.emit.checkedChange({
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
      data-state={() => (props.checked ? 'checked' : 'unchecked')}
      data-disabled={() => (props.disabled ? '' : undefined)}
    >
      <button
        part="root"
        type="button"
        role="switch"
        disabled={() => Boolean(props.disabled)}
        aria-checked={() => (props.checked ? 'true' : 'false')}
        aria-disabled={() => (props.disabled ? 'true' : undefined)}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span part="thumb" data-slot="switch-thumb" />
        <Slot />
      </button>
    </Host>
  )
}

export const ZSwitch = defineElement<
  SwitchProps,
  HTMLElement & { checked?: boolean },
  SwitchEmits
>(
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
    emits: {
      checkedChange: event<{ checked: boolean }>('checked-change'),
    },

    meta: {
      description: 'Headless switch primitive.',
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
