import { defineElement, Host, Slot } from '@zeus-js/zeus'

function setup() {
  return (
    <Host data-slot="dialog-title">
      <h2 part="root">
        <Slot />
      </h2>
    </Host>
  )
}

export const ZDialogTitle = defineElement(
  'z-dialog-title',
  {
    shadow: false,

    meta: {
      description: 'Headless dialog title.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },
  setup,
)
