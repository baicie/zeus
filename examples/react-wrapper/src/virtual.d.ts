declare module 'zeus:react:z-button' {
  import type {
    CSSProperties,
    ForwardRefExoticComponent,
    ReactNode,
    RefAttributes,
  } from 'react'

  export interface ZButtonProps {
    variant?: 'default' | 'outline'
    disabled?: boolean
    children?: ReactNode
    className?: string
    style?: CSSProperties
    onPress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void
  }

  export const ZButton: ForwardRefExoticComponent<
    ZButtonProps & RefAttributes<HTMLElement>
  >
}
