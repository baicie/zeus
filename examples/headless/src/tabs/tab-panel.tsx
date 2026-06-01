import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { findTabsHost } from './context'
import { bindBooleanProp } from '../shared/dom'

export interface TabPanelProps {
  value?: string
}

function setup(props: TabPanelProps, ctx: { host: HTMLElement }) {
  const active = () => findTabsHost(ctx.host)?.value === props.value

  const bindRoot = (el: HTMLDivElement | null) => {
    if (!el) return

    bindBooleanProp(el, 'hidden', () => !active())
  }

  return (
    <Host
      data-slot="tab-panel"
      data-state={() => (active() ? 'active' : 'inactive')}
    >
      <div ref={bindRoot} part="root" role="tabpanel">
        <Slot />
      </div>
    </Host>
  )
}

export const ZTabPanel = defineElement<TabPanelProps>(
  'z-tab-panel',
  {
    shadow: false,

    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
    },

    meta: {
      description: 'Headless tab panel.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },
  setup,
)
