export interface HostOptions {
  shadow: boolean | 'open' | 'closed'
  delegatesFocus?: boolean
}

export function createHost(root: HTMLElement, options: HostOptions): ShadowRoot | HTMLElement {
  if (options.shadow !== false) {
    return root.attachShadow({
      mode: options.shadow === 'closed' ? 'closed' : 'open',
      delegatesFocus: !!options.delegatesFocus,
    })
  }
  return root
}

export function getHostRoot(host: HTMLElement): HTMLElement | ShadowRoot {
  if (host.shadowRoot) {
    return host.shadowRoot
  }
  return host
}
