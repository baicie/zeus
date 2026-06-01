import { defineElement, Host, Slot } from '@zeus-js/zeus'

import { findDialogHost, setDialogOpen } from './context'
import { bindBooleanProp } from '../shared/dom'

function setup(_props: unknown, ctx: { host: HTMLElement }) {
  const open = () => Boolean(findDialogHost(ctx.host)?.open)

  const close = () => {
    setDialogOpen(ctx.host, false)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return

    event.preventDefault()
    close()
  }

  const bindRoot = (el: HTMLDivElement | null) => {
    if (!el) return

    bindBooleanProp(el, 'hidden', () => !open())
  }

  return (
    <Host
      data-slot="dialog-content"
      data-state={() => (open() ? 'open' : 'closed')}
    >
      <div ref={bindRoot} part="root" onKeyDown={onKeyDown}>
        <div part="overlay" data-slot="dialog-overlay" onClick={close} />

        <div
          part="panel"
          data-slot="dialog-panel"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <Slot />
        </div>
      </div>
    </Host>
  )
}

export const ZDialogContent = defineElement(
  'z-dialog-content',
  {
    shadow: false,

    meta: {
      description: 'Headless dialog content.',
      slots: {
        default: {},
      },
      cssParts: ['root', 'overlay', 'panel'],
    },
  },
  setup,
)
