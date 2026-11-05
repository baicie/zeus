import { createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createApp, defineComponent, h } from 'vue'

import './host-counter'

interface HostSession {
  readonly tag: string
  readonly label: string
}

const params = new URLSearchParams(location.search)
const session = parseSession(params)

void boot(session)

async function boot(options: HostSession): Promise<void> {
  try {
    mountReact(options)
    mountVue(options)
    post({ kind: 'host-ready', tag: options.tag })
  } catch (error) {
    post({
      kind: 'host-error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function parseSession(params: URLSearchParams): HostSession {
  const tag = params.get('tag') ?? 'z-host-counter'
  return {
    tag: /^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(tag) ? tag : 'z-host-counter',
    label: params.get('label') ?? 'Frameworks',
  }
}

function mountReact(options: HostSession): void {
  const container = document.querySelector('#react-root')
  if (!(container instanceof HTMLElement)) return
  const Counter = createElement(options.tag, {
    count: 3,
    label: 'React',
  })
  createRoot(container).render(
    createElement(
      StrictMode,
      null,
      createElement(
        'section',
        {
          'data-testid': 'react-host',
          className: 'framework-host',
        },
        createElement('h2', null, options.label),
        Counter,
      ),
    ),
  )
}

function mountVue(options: HostSession): void {
  const container = document.querySelector('#vue-root')
  if (!(container instanceof HTMLElement)) return
  const App = defineComponent({
    name: 'WebCHost',
    render: () =>
      h('section', { 'data-testid': 'vue-host', class: 'framework-host' }, [
        h('h2', null, options.label),
        h(options.tag, { count: 7, label: 'Vue' }),
      ]),
  })
  createApp(App).mount(container)
}

function post(message: Record<string, unknown>): void {
  if (window.parent === window) return
  window.parent.postMessage(
    { channel: 'zeus-webc-host', version: 1, ...message },
    location.origin,
  )
}
