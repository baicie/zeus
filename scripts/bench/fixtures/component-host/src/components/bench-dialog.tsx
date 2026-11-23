// benchmarks/component-host/src/components/bench-dialog.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface BenchDialogProps {
  open?: boolean
}

export const ZBenchDialog = defineElement<BenchDialogProps>(
  'z-bench-dialog',
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
      description: 'Benchmark dialog component.',
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
      cssParts: ['root', 'panel'],
    },
  },

  props => {
    return (
      <Host
        data-slot="bench-dialog"
        data-state={props.open ? 'open' : 'closed'}
      >
        <div part="root" hidden={!props.open}>
          <div part="panel">
            <Slot />
          </div>
        </div>
      </Host>
    )
  },
)
