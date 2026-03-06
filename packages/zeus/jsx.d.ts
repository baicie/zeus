import type { ReservedProps } from '@zeus-js/runtime-dom'

declare global {
  namespace JSX {
    interface IntrinsicAttributes extends ReservedProps {}
  }
}

export {}
