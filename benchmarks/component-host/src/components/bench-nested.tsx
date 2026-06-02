// benchmarks/component-host/src/components/bench-nested.tsx

import { defineElement, Host } from '@zeus-js/zeus'

export interface BenchNestedProps {
  depth?: number
  leafCount?: number
}

export const ZBenchNested = defineElement<BenchNestedProps>(
  'z-bench-nested',
  {
    shadow: false,

    props: {
      depth: {
        type: Number,
        default: 2,
        reflect: true,
      },
      leafCount: {
        type: Number,
        default: 3,
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark nested component tree.',
      cssParts: ['root', 'leaf'],
    },
  },

  props => {
    const leaves = []

    for (let i = 0; i < (props.leafCount ?? 3); i++) {
      leaves.push(<z-bench-nested-leaf data-index={i} data-leaf={true} />)
    }

    if ((props.depth ?? 2) > 1) {
      return (
        <Host data-depth={props.depth}>
          <div part="root">
            {leaves}
            <z-bench-nested-leaf
              data-branch={true}
              data-depth={(props.depth ?? 2) - 1}
            />
          </div>
        </Host>
      )
    }

    return (
      <Host data-depth={props.depth}>
        <div part="root">
          <z-bench-nested-leaf data-depth={0} data-leaf={true} />
          <z-bench-nested-leaf data-depth={0} data-leaf={true} />
          <z-bench-nested-leaf data-depth={0} data-leaf={true} />
        </div>
      </Host>
    )
  },
)

export const ZBenchNestedLeaf = defineElement<Record<string, unknown>>(
  'z-bench-nested-leaf',
  {
    shadow: false,
    props: {},
    meta: {
      description: 'Leaf node in nested benchmark tree.',
      cssParts: ['root'],
    },
  },

  props => {
    return (
      <Host>
        <span
          part="root"
          data-index={String(props['data-index'])}
          data-depth={String(props['data-depth'])}
        >
          {`leaf-${String(props['data-index'] ?? 0)}`}
        </span>
      </Host>
    )
  },
)
