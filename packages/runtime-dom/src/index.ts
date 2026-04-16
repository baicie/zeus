import { createRoot } from '@zeusjs/core'

export function render(fn: () => Node, container: Element): () => void {
  return createRoot(dispose => {
    const node = fn()
    container.appendChild(node)
    return dispose
  })
}
