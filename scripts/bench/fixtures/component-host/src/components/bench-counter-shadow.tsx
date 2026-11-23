// benchmarks/component-host/src/components/bench-counter-shadow.tsx

import { defineElement, Host } from '@zeus-js/zeus'

export interface BenchCounterShadowProps {
  count?: number
  label?: string
}

export const ZBenchCounterShadow = defineElement<BenchCounterShadowProps>(
  'z-bench-counter-shadow',
  {
    shadow: true,

    props: {
      count: {
        type: Number,
        default: 0,
        reflect: true,
      },
      label: {
        type: String,
        default: 'count',
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark counter component (Shadow DOM).',
      cssParts: ['root', 'label', 'value'],
    },
  },

  props => {
    return (
      <Host data-count={props.count}>
        <span part="root">
          <span part="label">{props.label}</span>
          <span part="value">{props.count}</span>
        </span>
      </Host>
    )
  },
)
