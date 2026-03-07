import type { ReservedProps } from '@zeus-js/core'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'zeus-counter': ReservedProps & {
        start?: string | number | null
        label?: string | null
      }
      'zeus-counter-shadow': ReservedProps & {
        start?: string | number | null
        label?: string | null
      }
      'zeus-counter-provider': ReservedProps
      'zeus-counter-store': ReservedProps & {
        start?: string | number | null
        label?: string | null
      }
      'zeus-counter-easy': ReservedProps
    }
  }
}

export {}
