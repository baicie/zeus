// benchmarks/component-host/src/components/bench-dialog-shadow.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface BenchDialogShadowProps {
  open?: boolean
}

export const ZBenchDialogShadow = defineElement<BenchDialogShadowProps>(
  'z-bench-dialog-shadow',
  {
    shadow: true,

    props: {
      open: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark dialog component (Shadow DOM).',
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
      <Host data-state={props.open ? 'open' : 'closed'}>
        <div part="root" hidden={!props.open}>
          <div part="panel">
            <Slot />
          </div>
        </div>
      </Host>
    )
  },
)
