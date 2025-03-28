import { setHydrateContext, sharedConfig } from '@zeus-js/hydration'

export function hydrateDOM(container: Element, component: any) {
  // 使用 hydration 包中的功能
  setHydrateContext()
  // ...
}
