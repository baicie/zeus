import { Host, Slot, defineElement } from '@zeus-js/zeus'

defineElement(
  'z-card',
  {
    shadow: false,
    styles: `
      z-card {
        display: block;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 12px;
        margin-top: 12px;
      }

      z-card [part="header"] {
        font-weight: 600;
        margin-bottom: 8px;
      }
    `,
  },
  () => {
    return (
      <Host>
        <section>
          <header part="header">
            <Slot name="header">Default Header</Slot>
          </header>

          <main part="content">
            <Slot />
          </main>
        </section>
      </Host>
    )
  },
)
