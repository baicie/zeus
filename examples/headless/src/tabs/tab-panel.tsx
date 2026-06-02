import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { findTabsHost } from './context'

export interface TabPanelProps {
  value?: string
}

function setup(props: TabPanelProps, ctx: { host: HTMLElement }) {
  const active = () => findTabsHost(ctx.host)?.value === props.value

  return (
    <Host
      data-slot="tab-panel"
      data-state={() => (active() ? 'active' : 'inactive')}
    >
      <div part="root" role="tabpanel" hidden={!active()}>
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
