import { render } from '@zeus-js/zeus'

import '@zeus-web/data-grid/wc/auto'
import type {} from '@zeus-web/data-grid/wc'
import '@zeus-web/dialog/wc/auto'
import type {} from '@zeus-web/dialog/wc'
import '@zeus-web/input/wc/auto'
import type {} from '@zeus-web/input/wc'

import { App } from './app'
import './style.css'

const root = document.getElementById('root')
if (!root) throw new Error('Zeus Admin root element was not found.')
const mountRoot = root

async function mount(): Promise<void> {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has('devtools')
  ) {
    const { createDevtoolsConsumer, createDevtoolsPanel } =
      await import('@zeus-js/devtools-consumer')
    const consumer = createDevtoolsConsumer(window)
    consumer.connect()
    const container = document.createElement('aside')
    container.id = 'admin-devtools'
    container.style.cssText =
      'background:#020617;color:#e2e8f0;height:48vh;inset:auto 0 0 auto;overflow:auto;position:fixed;width:min(390px,100vw);z-index:10000'
    document.body.append(container)
    const previousPaddingRight = document.body.style.paddingRight
    document.body.style.paddingRight = '390px'
    const panel = createDevtoolsPanel(container, consumer)
    Object.assign(window, {
      adminDevtools: {
        disconnect() {
          consumer.disconnect()
          panel.disconnect()
          container.remove()
          document.body.style.paddingRight = previousPaddingRight
        },
        snapshot: () => consumer.getSnapshot(),
      },
    })
  }

  render(() => <App />, mountRoot)
}

void mount()
