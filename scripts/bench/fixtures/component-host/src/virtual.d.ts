declare module 'zeus:react:z-bench-button' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    ReactNode,
    RefAttributes,
  } from 'react'

  export interface BenchButtonProps {
    variant?: 'default' | 'outline'
    disabled?: boolean
    children?: ReactNode
    className?: string
    style?: CSSProperties
    onPress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void
  }

  export const ZBenchButton: ForwardRefExoticComponent<
    BenchButtonProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:react:z-bench-counter' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    RefAttributes,
  } from 'react'

  export interface BenchCounterProps {
    count?: number
    label?: string
    className?: string
    style?: CSSProperties
  }

  export const ZBenchCounter: ForwardRefExoticComponent<
    BenchCounterProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:react:z-bench-card' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    ReactNode,
    RefAttributes,
  } from 'react'

  export interface BenchCardProps {
    elevated?: boolean
    children?: ReactNode
    className?: string
    style?: CSSProperties
  }

  export const ZBenchCard: ForwardRefExoticComponent<
    BenchCardProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:react:z-bench-dialog' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    ReactNode,
    RefAttributes,
  } from 'react'

  export interface BenchDialogProps {
    open?: boolean
    children?: ReactNode
    className?: string
    style?: CSSProperties
  }

  export const ZBenchDialog: ForwardRefExoticComponent<
    BenchDialogProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:vue:z-bench-button' {
  export interface BenchButtonProps {
    variant?: 'default' | 'outline'
    disabled?: boolean
  }

  export const ZBenchButton: new () => HTMLElement & BenchButtonProps
}

declare module 'zeus:vue:z-bench-counter' {
  export interface BenchCounterProps {
    count?: number
    label?: string
  }

  export const ZBenchCounter: new () => HTMLElement & BenchCounterProps
}

declare module 'zeus:vue:z-bench-card' {
  export interface BenchCardProps {
    elevated?: boolean
  }

  export const ZBenchCard: new () => HTMLElement & BenchCardProps
}

declare module 'zeus:vue:z-bench-dialog' {
  export interface BenchDialogProps {
    open?: boolean
  }

  export const ZBenchDialog: new () => HTMLElement & BenchDialogProps
}

// ─── Shadow DOM ───────────────────────────────────────────────────────────────

declare module 'zeus:react:z-bench-button-shadow' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    ReactNode,
    RefAttributes,
  } from 'react'

  export interface BenchButtonShadowProps {
    variant?: 'default' | 'outline'
    disabled?: boolean
    children?: ReactNode
    className?: string
    style?: CSSProperties
    onPress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void
  }

  export const ZBenchButtonShadow: ForwardRefExoticComponent<
    BenchButtonShadowProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:react:z-bench-counter-shadow' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    RefAttributes,
  } from 'react'

  export interface BenchCounterShadowProps {
    count?: number
    label?: string
    className?: string
    style?: CSSProperties
  }

  export const ZBenchCounterShadow: ForwardRefExoticComponent<
    BenchCounterShadowProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:react:z-bench-card-shadow' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    ReactNode,
    RefAttributes,
  } from 'react'

  export interface BenchCardShadowProps {
    elevated?: boolean
    children?: ReactNode
    className?: string
    style?: CSSProperties
  }

  export const ZBenchCardShadow: ForwardRefExoticComponent<
    BenchCardShadowProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:react:z-bench-dialog-shadow' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    ReactNode,
    RefAttributes,
  } from 'react'

  export interface BenchDialogShadowProps {
    open?: boolean
    children?: ReactNode
    className?: string
    style?: CSSProperties
  }

  export const ZBenchDialogShadow: ForwardRefExoticComponent<
    BenchDialogShadowProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:react:z-bench-nested' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    RefAttributes,
  } from 'react'

  export interface BenchNestedProps {
    depth?: number
    leafCount?: number
    className?: string
    style?: CSSProperties
  }

  export const ZBenchNested: ForwardRefExoticComponent<
    BenchNestedProps & RefAttributes<HTMLElement>
  >
}

declare module 'zeus:react:z-bench-nested-leaf' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    RefAttributes,
  } from 'react'

  export interface BenchNestedLeafProps {
    className?: string
    style?: CSSProperties
  }

  export const ZBenchNestedLeaf: ForwardRefExoticComponent<
    BenchNestedLeafProps & RefAttributes<HTMLElement>
  >
}

// ─── Vue ──────────────────────────────────────────────────────────────────────

declare module 'zeus:vue:z-bench-button-shadow' {
  export interface BenchButtonShadowProps {
    variant?: 'default' | 'outline'
    disabled?: boolean
  }

  export const ZBenchButtonShadow: new () => HTMLElement &
    BenchButtonShadowProps
}

declare module 'zeus:vue:z-bench-counter-shadow' {
  export interface BenchCounterShadowProps {
    count?: number
    label?: string
  }

  export const ZBenchCounterShadow: new () => HTMLElement &
    BenchCounterShadowProps
}

declare module 'zeus:vue:z-bench-card-shadow' {
  export interface BenchCardShadowProps {
    elevated?: boolean
  }

  export const ZBenchCardShadow: new () => HTMLElement & BenchCardShadowProps
}

declare module 'zeus:vue:z-bench-dialog-shadow' {
  export interface BenchDialogShadowProps {
    open?: boolean
  }

  export const ZBenchDialogShadow: new () => HTMLElement &
    BenchDialogShadowProps
}

declare module 'zeus:vue:z-bench-nested' {
  export interface BenchNestedProps {
    depth?: number
    leafCount?: number
  }

  export const ZBenchNested: new () => HTMLElement & BenchNestedProps
}

declare module 'zeus:vue:z-bench-nested-leaf' {
  export const ZBenchNestedLeaf: new () => HTMLElement
}
