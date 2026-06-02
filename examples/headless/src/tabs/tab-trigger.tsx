import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { findTabsHost, setTabsValue } from './context'
import { bindBooleanProp, bindDomProp, bindOptionalAttr } from '../shared/dom'
import { isEnterOrSpace } from '../shared/keyboard'

export interface TabTriggerProps {
  value?: string
  disabled?: boolean
}

function setup(props: TabTriggerProps, ctx: { host: HTMLElement }) {
  let button!: HTMLButtonElement
  const selected = () => findTabsHost(ctx.host)?.value === props.value

  const select = () => {
    if (props.disabled || !props.value) return
    setTabsValue(ctx.host, props.value)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isEnterOrSpace(event)) return

    event.preventDefault()
    select()
  }

  const bindButton = (el: HTMLButtonElement | null) => {
    if (!el) return

    button = el
    bindOptionalAttr(button, 'aria-selected', () =>
      selected() ? 'true' : 'false',
    )
    bindOptionalAttr(button, 'aria-disabled', () =>
      props.disabled ? 'true' : undefined,
    )
    bindBooleanProp(button, 'disabled', () => Boolean(props.disabled))
    bindDomProp(button, 'tabIndex', () => (selected() ? 0 : -1))
  }

  return (
    <Host
      data-slot="tab-trigger"
      data-state={() => (selected() ? 'active' : 'inactive')}
      data-disabled={() => (props.disabled ? '' : undefined)}
    >
      <button
        ref={bindButton}
        part="root"
        type="button"
        role="tab"
        onClick={select}
        onKeyDown={onKeyDown}
      >
        <Slot />
      </button>
    </Host>
  )
}

export const ZTabTrigger = defineElement<TabTriggerProps>(
  'z-tab-trigger',
  {
    shadow: false,

    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless tab trigger.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },
  setup,
)
