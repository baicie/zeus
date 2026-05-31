import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { bindBooleanProp, bindOptionalAttr } from '../shared/dom'
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
  let button!: HTMLButtonElement

  const state = () =>
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

  const bindButton = (el: HTMLButtonElement | null) => {
    if (!(el instanceof HTMLButtonElement)) return

    button = el
    bindOptionalAttr(button, 'aria-checked', () =>
      props.indeterminate ? 'mixed' : props.checked ? 'true' : 'false',
    )
    bindOptionalAttr(button, 'aria-disabled', () =>
      props.disabled ? 'true' : undefined,
    )
    bindBooleanProp(button, 'disabled', () => Boolean(props.disabled))
  }

  return (
    <Host
      data-slot="checkbox"
      data-state={state}
      data-disabled={() => (props.disabled ? '' : undefined)}
    >
      <button
        ref={bindButton}
        part="root"
        type="button"
        role="checkbox"
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
