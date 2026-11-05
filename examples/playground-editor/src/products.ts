import { createSignal } from '@zeus-js/zeus'

export type PlaygroundProduct = 'native-lab' | 'webc-studio'

export interface ProductState {
  readonly product: PlaygroundProduct
}

export const [activeProduct, setActiveProduct] =
  createSignal<PlaygroundProduct>(resolveInitialProduct())

function resolveInitialProduct(): PlaygroundProduct {
  if (typeof location === 'undefined') return 'native-lab'
  return location.pathname.includes('webc') ? 'webc-studio' : 'native-lab'
}

export function productHref(product: PlaygroundProduct): string {
  return product === 'webc-studio' ? '/webc.html' : '/'
}
