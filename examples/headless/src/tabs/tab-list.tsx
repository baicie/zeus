import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { findTabsHost } from './context'

function setup(_props: unknown, ctx: { host: HTMLElement }) {
  return (
    <Host data-slot="tab-list">
      <div
        part="root"
        role="tablist"
        aria-orientation={() =>
          findTabsHost(ctx.host)?.orientation ?? 'horizontal'
        }
      >
        <Slot />
      </div>
    </Host>
  )
}

export const ZTabList = defineElement(
  'z-tab-list',
  {
    shadow: false,

    meta: {
      description: 'Headless tabs list.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },
  setup,
)
