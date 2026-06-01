import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { setDialogOpen } from './context'

function setup(_props: unknown, ctx: { host: HTMLElement }) {
  return (
    <Host data-slot="dialog-trigger">
      <button
        part="root"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setDialogOpen(ctx.host, true)}
      >
        <Slot />
      </button>
    </Host>
  )
}

export const ZDialogTrigger = defineElement(
  'z-dialog-trigger',
  {
    shadow: false,

    meta: {
      description: 'Headless dialog trigger.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },
  setup,
)
