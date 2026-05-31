import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { findTabsHost } from './context'
import { bindOptionalAttr } from '../shared/dom'

function setup(_props: unknown, ctx: { host: HTMLElement }) {
  const bindRoot = (el: HTMLDivElement | null) => {
    if (!el) return

    bindOptionalAttr(
      el,
      'aria-orientation',
      () => findTabsHost(ctx.host)?.orientation ?? 'horizontal',
    )
  }

  return (
    <Host data-slot="tab-list">
      <div ref={bindRoot} part="root" role="tablist">
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
