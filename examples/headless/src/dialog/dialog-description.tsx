import { defineElement, Host, Slot } from '@zeus-js/zeus'

function setup() {
  return (
    <Host data-slot="dialog-description">
      <p part="root">
        <Slot />
      </p>
    </Host>
  )
}

export const ZDialogDescription = defineElement(
  'z-dialog-description',
  {
    shadow: false,

    meta: {
      description: 'Headless dialog description.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },
  setup,
)
