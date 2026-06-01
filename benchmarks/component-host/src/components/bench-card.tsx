// benchmarks/component-host/src/components/bench-card.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface BenchCardProps {
  elevated?: boolean
}

export const ZBenchCard = defineElement<BenchCardProps>(
  'z-bench-card',
  {
    shadow: false,

    props: {
      elevated: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark card component.',
      slots: {
        default: {},
        header: {},
        footer: {},
      },
      cssParts: ['root', 'header', 'body', 'footer'],
    },
  },

  props => {
    const state = props.elevated ? 'elevated' : 'flat'

    return (
      <Host data-slot="bench-card" data-state={state}>
        <section part="root">
          <header part="header">
            <Slot name="header" />
          </header>

          <div part="body">
            <Slot />
          </div>

          <footer part="footer">
            <Slot name="footer" />
          </footer>
        </section>
      </Host>
    )
  },
)
