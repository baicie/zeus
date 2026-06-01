declare module 'zeus:vue:z-button' {
  import type { DefineComponent } from 'vue'

  export const ZButton: DefineComponent<{
    variant?: 'default' | 'outline'
    disabled?: boolean
  }>
}
