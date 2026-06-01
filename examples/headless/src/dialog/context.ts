export interface DialogHost extends HTMLElement {
  open?: boolean
}

export function findDialogHost(el: HTMLElement): DialogHost | null {
  return el.closest('z-dialog') as DialogHost | null
}

export function setDialogOpen(el: HTMLElement, open: boolean): void {
  const dialog = findDialogHost(el)

  if (!dialog) return

  dialog.open = open

  dialog.dispatchEvent(
    new CustomEvent('open-change', {
      detail: { open },
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  )
}
