import { defineElement, Host, Slot } from '@zeus-js/zeus'

export const ZGreeting = defineElement(
  'z-greeting',
  {
    shadow: false,
    props: {
      name: String,
    },
  },
  props => (
    <Host data-component="greeting">
      <p part="label">Hello, {String(props.name ?? 'World')}!</p>
      <Slot />
    </Host>
  ),
)
