import {
  createDevtoolsConsumer,
  createDevtoolsPanel,
} from '@zeus-js/devtools-consumer'
import { createSignal, render } from '@zeus-js/zeus'

import './style.css'

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
    </section>
  ),
  document.querySelector<HTMLElement>('#app')!,
)

Object.assign(window, {
  devtoolsSmoke: {
    increment: () => setCount(count() + 1),
    snapshot: () => consumer.getSnapshot(),
    dispose() {
      dispose()
      consumer.disconnect()
      panel.disconnect()
    },
  },
})
