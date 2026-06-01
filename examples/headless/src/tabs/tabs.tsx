import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface TabsProps {
  value?: string
  orientation?: 'horizontal' | 'vertical'
}

function setup(props: TabsProps) {
  return (
    <Host data-slot="tabs" data-orientation={() => props.orientation}>
      <Slot />
    </Host>
  )
}

export const ZTabs = defineElement<TabsProps>(
  'z-tabs',
  {
    shadow: false,

    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
      orientation: {
        type: String,
        default: 'horizontal',
        reflect: true,
      },
    },

    meta: {
      description: 'Headless tabs root.',
      events: {
        'value-change': {
          detail: {
            value: 'string',
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
