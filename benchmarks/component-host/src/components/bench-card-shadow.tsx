// benchmarks/component-host/src/components/bench-card-shadow.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface BenchCardShadowProps {
  elevated?: boolean
}

export const ZBenchCardShadow = defineElement<BenchCardShadowProps>(
  'z-bench-card-shadow',
  {
    shadow: true,

    props: {
      elevated: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark card component (Shadow DOM).',
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
      <Host data-state={state}>
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
