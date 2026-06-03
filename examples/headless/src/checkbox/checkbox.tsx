import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { isEnterOrSpace } from '../shared/keyboard'

export interface CheckboxProps {
  checked?: boolean
  indeterminate?: boolean
  disabled?: boolean
}

function setup(
  props: CheckboxProps,
  ctx: {
    emit: (event: string, detail: unknown) => void
    host: HTMLElement & { checked?: boolean; indeterminate?: boolean }
  },
) {
  const checkedState = () =>
    props.indeterminate
      ? 'indeterminate'
      : props.checked
        ? 'checked'
        : 'unchecked'

  const toggle = () => {
    if (props.disabled) return

    const next = props.indeterminate ? true : !props.checked
    ctx.host.indeterminate = false
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
      data-slot="checkbox"
      data-state={checkedState}
      data-disabled={() => (props.disabled ? '' : undefined)}
    >
      <button
        part="root"
        type="button"
        role="checkbox"
        disabled={() => Boolean(props.disabled)}
        aria-checked={() =>
          props.indeterminate ? 'mixed' : props.checked ? 'true' : 'false'
        }
        aria-disabled={() => (props.disabled ? 'true' : undefined)}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span part="indicator" data-slot="checkbox-indicator">
          <Slot name="indicator" />
        </span>
        <Slot />
      </button>
    </Host>
  )
}

export const ZCheckbox = defineElement<CheckboxProps>(
  'z-checkbox',
  {
    shadow: false,

    props: {
      checked: {
        type: Boolean,
        default: false,
        reflect: true,
      },
      indeterminate: {
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
      description: 'Headless checkbox primitive.',
      events: {
        'checked-change': {
          detail: {
            checked: 'boolean',
          },
        },
      },
      slots: {
        default: {
          description: 'Checkbox label.',
        },
      },
      cssParts: ['root', 'indicator'],
    },
  },
  setup,
)
