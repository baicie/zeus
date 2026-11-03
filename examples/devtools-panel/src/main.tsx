import {
  createDevtoolsConsumer,
  createDevtoolsPanel,
} from '@zeus-js/devtools-consumer'
import { Host, Slot, createSignal, defineElement, render } from '@zeus-js/zeus'

import './style.css'

defineElement('z-devtools-card', { shadow: false }, () => (
  <Host>
    <article data-testid="web-component-card">
      <strong>Web Component root</strong>
      <Slot />
    </article>
  </Host>
))
defineElement(
  'z-devtools-shadow-card',
  {
    shadow: true,
    styles: ':host { display: block; }',
  },
  () => {
    const [shadowCount, setShadowCount] = createSignal(0)
    return (
      <Host>
        <article data-testid="shadow-card">
          <strong>Shadow root</strong>
          <button
            type="button"
            data-testid="shadow-counter"
            onClick={() => setShadowCount(shadowCount() + 1)}
          >
            Shadow count: {shadowCount()}
          </button>
        </article>
      </Host>
    )
  },
)

const consumer = createDevtoolsConsumer(window)
consumer.connect()

const panel = createDevtoolsPanel(
  document.querySelector<HTMLElement>('#devtools')!,
  consumer,
)

const [count, setCount] = createSignal(0)
const dispose = render(
  () => (
    <section class="app-card">
      <p class="eyebrow">Live runtime graph</p>
      <h1>Zeus DevTools</h1>
      <p>
        Click the bound control; its effect, DOM binding and signal source
        appear in the panel.
      </p>
      <button
        type="button"
        data-testid="counter"
        onClick={() => setCount(count() + 1)}
      >
        Count: {count()}
      </button>
      <z-devtools-card>
        <span>projected content</span>
      </z-devtools-card>
    </section>
  ),
  document.querySelector<HTMLElement>('#app')!,
)
const disposeSecondary = render(
  () => (
    <section>
      <p data-testid="secondary-root">Secondary root: {count()}</p>
      <z-devtools-shadow-card />
    </section>
  ),
  document.querySelector<HTMLElement>('#secondary')!,
)
const webComponent = document.querySelector('z-devtools-card')!
const shadowComponent = document.querySelector('z-devtools-shadow-card')!

Object.assign(window, {
  devtoolsSmoke: {
    increment: () => setCount(count() + 1),
    snapshot: () => consumer.getSnapshot(),
    toggleWebComponent() {
      if (webComponent.isConnected) webComponent.remove()
      else document.querySelector('#app')?.append(webComponent)
      if (shadowComponent.isConnected) shadowComponent.remove()
      else document.querySelector('#secondary')?.append(shadowComponent)
    },
    dispose() {
      dispose()
      disposeSecondary()
      consumer.disconnect()
      panel.disconnect()
    },
  },
})
