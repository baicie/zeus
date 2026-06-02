// benchmarks/component-host/src/components/bench-counter.tsx

import { defineElement, Host } from '@zeus-js/zeus'

export interface BenchCounterProps {
  count?: number
  label?: string
}

export const ZBenchCounter = defineElement<BenchCounterProps>(
  'z-bench-counter',
  {
    shadow: false,

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
      description: 'Benchmark counter component.',
      cssParts: ['root', 'label', 'value'],
    },
  },

  props => {
    return (
      <Host data-slot="bench-counter" data-count={props.count}>
        <span part="root">
          <span part="label">{props.label}</span>
          <span part="value">{props.count}</span>
        </span>
      </Host>
    )
  },
)
