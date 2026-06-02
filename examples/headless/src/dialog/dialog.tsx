import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface DialogProps {
  open?: boolean
}

function setup(props: DialogProps) {
  return (
    <Host
      data-slot="dialog"
      data-state={() => (props.open ? 'open' : 'closed')}
    >
      <Slot />
    </Host>
  )
}

export const ZDialog = defineElement<DialogProps>(
  'z-dialog',
  {
    shadow: false,

    props: {
      open: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless dialog root.',
      events: {
        'open-change': {
          detail: {
            open: 'boolean',
          },
        },
      },
      slots: {
        default: {},
      },
    },
  },
  setup,
)
