export interface TabsHost extends HTMLElement {
  value?: string
  orientation?: 'horizontal' | 'vertical'
}

export function findTabsHost(el: HTMLElement): TabsHost | null {
  return el.closest('z-tabs') as TabsHost | null
}

export function getTabsValue(el: HTMLElement): string | undefined {
  return findTabsHost(el)?.value
}

export function setTabsValue(el: HTMLElement, value: string): void {
  const tabs = findTabsHost(el)

  if (!tabs) return

  tabs.value = value

  tabs.dispatchEvent(
    new CustomEvent('value-change', {
      detail: { value },
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  )
}
