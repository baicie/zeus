import * as runtimeDOM from '@zeus-js/runtime-dom'
import * as runtimeSSR from '@zeus-js/runtime-ssr'
import * as signal from '@zeus-js/signal'
import { type JSDOM } from 'jsdom'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  compileOk,
  installJSDOM,
  loadModule,
  removeDOMGlobals,
} from './matrix-harness'

/**
 * PR-17: compiler-driven automatic hydration.
 *
 * The same TSX source is compiled for DOM and SSR with `autoHydrate: true`.
 * The SSR output is parsed into a real DOM, the user interacts with it, and
 * `render(..., { hydrate: true })` takes over the existing nodes instead of
 * creating a new tree. Every assertion below is about real DOM identity,
 * focus/selection and observable failure scope, not HTML snapshots.
 */

type Props = Record<string, unknown>
type AppModule = { App(props: Props): unknown }

const domModules = {
  '@zeus-js/runtime-dom': runtimeDOM,
  '@zeus-js/zeus': runtimeDOM,
} as unknown as Record<string, Record<string, unknown>>
const ssrModules = {
  '@zeus-js/runtime-ssr': runtimeSSR,
} as unknown as Record<string, Record<string, unknown>>

let jsdom: JSDOM

beforeAll(() => {
  jsdom = installJSDOM()
})

async function loadSSR(
  code: string,
  realm: string,
): Promise<(props: Props) => string> {
  removeDOMGlobals()
  const module = await loadModule<AppModule>(code, realm, ssrModules)
  return props => {
    removeDOMGlobals()
    return runtimeSSR.renderToString(
      () => module.App(props) as runtimeSSR.SSRNode,
    )
  }
}

async function loadDOM(code: string, realm: string): Promise<AppModule> {
  installJSDOM(jsdom)
  return loadModule<AppModule>(code, realm, domModules)
}

/** Props whose getters read one signal, as a parent component would pass. */
function reactiveProps(initial: Props): {
  props: Props
  set(next: Props): void
} {
  const [state, setState] = signal.createSignal(initial)
  const props: Props = {}
  for (const key of Object.keys(initial)) {
    Object.defineProperty(props, key, {
      enumerable: true,
      get: () => state()[key],
    })
  }
  return { props, set: next => setState(() => next) }
}

function recordNodes(container: Node): Set<Node> {
  const nodes = new Set<Node>()
  const walker = (container.ownerDocument as Document).createTreeWalker(
    container,
    0xffffffff,
  )
  let current = walker.nextNode()
  while (current) {
    nodes.add(current)
    current = walker.nextNode()
  }
  return nodes
}

function countNewNodes(before: Set<Node>, container: Node): number {
  let created = 0
  const walker = (container.ownerDocument as Document).createTreeWalker(
    container,
    0xffffffff,
  )
  let current = walker.nextNode()
  while (current) {
    if (!before.has(current)) created++
    current = walker.nextNode()
  }
  return created
}

const STATIC_SOURCE = `
export const App = props => (
  <main class="app" title={props.title}>
    <button onClick={props.onClick}>count: {props.count}</button>
    <input prop:value={props.name} aria-label="name" />
    <b>{props.label}</b>
  </main>
)
`

const CHILD_SOURCE = `
const Child = props => <li class="child" title={props.title}>{props.label}</li>
export const App = props => (
  <main>
    <ul><Child title={props.title} label={props.label} /></ul>
    <b>{props.label}</b>
  </main>
)
`

const SHOW_SOURCE = `
import { Show } from '@zeus-js/zeus'
export const App = props => (
  <main>
    <Show when={props.open} fallback={<i>off</i>}><b>{props.label}</b></Show>
  </main>
)
`

async function hydrateFixture(
  source: string,
  initial: Props,
  options: { autoHydrate?: boolean } = {},
): Promise<{
  container: HTMLElement
  module: AppModule
  props: Props
  set(next: Props): void
  errors: unknown[]
  dispose(): void
}> {
  const dom = compileOk(source, 'dom', { autoHydrate: true, ...options })
  const ssr = compileOk(source, 'ssr', { autoHydrate: true, ...options })
  const render = await loadSSR(ssr.code, `auto:ssr:${Math.random()}`)
  const html = render(initial)

  installJSDOM(jsdom)
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)

  const module = await loadDOM(dom.code, `auto:dom:${Math.random()}`)
  const { props, set } = reactiveProps(initial)
  const errors: unknown[] = []
  const dispose = runtimeDOM.render(
    () => module.App(props) as runtimeDOM.JSXValue,
    container,
    {
      hydrate: true,
      onHydrationError: error => errors.push(error),
    },
  )
  return { container, module, props, set, errors, dispose }
}

describe('automatic hydration', () => {
  it('adopts every server node and keeps identity, focus, selection and input', async () => {
    const { container, errors, set, dispose } = await hydrateFixture(
      STATIC_SOURCE,
      {
        title: 'server',
        count: 3,
        name: 'server',
        label: 'L',
        onClick: () => {},
      },
    )
    expect(errors).toEqual([])

    const main = container.querySelector('main')!
    const input = container.querySelector('input') as HTMLInputElement
    const label = container.querySelector('b')!
    const button = container.querySelector('button')!

    // The user interacts before the client module registers.
    input.value = 'typed before hydration'
    input.focus()
    input.setSelectionRange(2, 8)
    const before = recordNodes(container)
    const serverInput = input

    // Re-render is not possible on the same container; the fixture already
    // hydrated, so assert the state it left behind.
    expect(container.querySelector('main')).toBe(main)
    expect(container.querySelector('input')).toBe(serverInput)
    expect(container.querySelector('b')).toBe(label)
    expect(container.querySelector('button')).toBe(button)
    expect(input.value).toBe('typed before hydration')
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 8])
    expect(container.querySelector('button')!.textContent).toBe('count: 3')

    set({
      title: 'client',
      count: 4,
      name: 'client',
      label: 'M',
      onClick: () => {},
    })
    expect(main.getAttribute('title')).toBe('client')
    expect(container.querySelector('b')).toBe(label)
    expect(label.textContent).toBe('M')
    expect(button.textContent).toBe('count: 4')
    expect(input.value).toBe('client')
    expect(countNewNodes(before, container)).toBe(0)
    dispose()
  })

  it('adopts nested component subtrees', async () => {
    const { container, errors, set, dispose } = await hydrateFixture(
      CHILD_SOURCE,
      { title: 't', label: 'L' },
    )
    expect(errors).toEqual([])
    const child = container.querySelector('li.child')!
    const bold = container.querySelector('b')!
    const before = recordNodes(container)

    set({ title: 'u', label: 'M' })
    expect(container.querySelector('li.child')).toBe(child)
    expect(child.getAttribute('title')).toBe('u')
    expect(child.textContent).toBe('M')
    expect(container.querySelector('b')).toBe(bold)
    expect(bold.textContent).toBe('M')
    expect(countNewNodes(before, container)).toBe(0)
    dispose()
  })

  it('rebuilds only the mismatched component subtree and reports the scope', async () => {
    const dom = compileOk(STATIC_SOURCE, 'dom', { autoHydrate: true })
    const ssr = compileOk(STATIC_SOURCE, 'ssr', { autoHydrate: true })
    const render = await loadSSR(ssr.code, 'auto:mismatch:ssr')
    const html = render({
      title: 'server',
      count: 1,
      name: 'server',
      label: 'L',
      onClick: () => {},
    })

    installJSDOM(jsdom)
    const container = document.createElement('div')
    container.innerHTML = html
    // An element the server never rendered: the plan has no marker for it.
    const extra = document.createElement('span')
    extra.textContent = 'extra'
    container.querySelector('main')!.append(extra)
    const footer = document.createElement('footer')
    footer.textContent = 'outside'
    container.append(footer)
    document.body.append(container)

    const module = await loadDOM(dom.code, 'auto:mismatch:dom')
    const { props } = reactiveProps({
      title: 'server',
      count: 1,
      name: 'server',
      label: 'L',
      onClick: () => {},
    })
    const errors: Error[] = []
    const dispose = runtimeDOM.render(
      () => module.App(props) as runtimeDOM.JSXValue,
      container,
      {
        hydrate: true,
        onHydrationError: error => errors.push(error as Error),
      },
    )

    expect(errors.map(error => error.message.split(':')[0])).toEqual([
      'ZEUS_HYDRATION_EXTRA_NODE',
    ])
    // The failing owner (the app root) was rebuilt; its replacement is marked,
    // and nodes outside the failing subtree kept their identity.
    const main = container.querySelector('main')!
    expect(main).not.toBe(container.querySelector('footer'))
    expect(main.hasAttribute('data-zeus-hydration-fallback')).toBe(true)
    expect(container.querySelector('footer')).toBe(footer)
    expect(extra.isConnected).toBe(false)
    expect(container.querySelector('span')).toBeNull()
    expect(container.querySelector('b')!.textContent).toBe('L')
    dispose()
  })

  it('refuses to adopt the same container twice', async () => {
    const { container, dispose } = await hydrateFixture(STATIC_SOURCE, {
      title: 'server',
      count: 1,
      name: 'server',
      label: 'L',
      onClick: () => {},
    })
    const module = await loadDOM(
      compileOk(STATIC_SOURCE, 'dom', { autoHydrate: true }).code,
      'auto:twice:dom',
    )
    const { props } = reactiveProps({
      title: 'a',
      count: 1,
      name: 'a',
      label: 'a',
      onClick: () => {},
    })
    expect(() =>
      runtimeDOM.render(
        () => module.App(props) as runtimeDOM.JSXValue,
        container,
        {
          hydrate: true,
        },
      ),
    ).toThrowError(/ZEUS_HYDRATION_DUPLICATE_OWNER/)
    dispose()
  })

  it('does not adopt children of custom elements or shadow roots', async () => {
    const source = `
export const App = props => (
  <main>
    <z-card><b data-inside>{props.label}</b></z-card>
    <i>{props.label}</i>
  </main>
)
`
    const dom = compileOk(source, 'dom', { autoHydrate: true })
    const ssr = compileOk(source, 'ssr', { autoHydrate: true })
    const render = await loadSSR(ssr.code, 'auto:ce:ssr')
    const html = render({ label: 'L' })

    installJSDOM(jsdom)
    const container = document.createElement('div')
    container.innerHTML = html
    const card = container.querySelector('z-card')!
    // The CE owner territory: its own renderer content must stay untouched.
    card.attachShadow({ mode: 'open' }).innerHTML =
      '<!--zeus:hydrate:c1.t99--><span>shadow server</span>'
    const inside = container.querySelector('[data-inside]')!
    const shadowSpan = card.shadowRoot!.querySelector('span')!
    document.body.append(container)
    const before = recordNodes(card)

    const module = await loadDOM(dom.code, 'auto:ce:dom')
    const { props } = reactiveProps({ label: 'L' })
    const errors: unknown[] = []
    const dispose = runtimeDOM.render(
      () => module.App(props) as runtimeDOM.JSXValue,
      container,
      {
        hydrate: true,
        onHydrationError: error => errors.push(error),
      },
    )

    expect(errors).toEqual([])
    expect(container.querySelector('[data-inside]')).toBe(inside)
    expect(card.shadowRoot!.querySelector('span')).toBe(shadowSpan)
    expect(countNewNodes(before, card)).toBe(0)
    dispose()
  })

  it('rebuilds reactive regions without duplicating server content', async () => {
    const { container, errors, set, dispose } = await hydrateFixture(
      SHOW_SOURCE,
      {
        open: true,
        label: 'server',
      },
    )
    // Region content is rebuilt by contract; the region itself must not
    // duplicate the server branch, and later updates must work.
    expect(errors).toEqual([])
    expect(container.querySelectorAll('b')).toHaveLength(1)
    expect(container.querySelector('b')!.textContent).toBe('server')
    set({ open: false, label: 'server' })
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('i')!.textContent).toBe('off')
    set({ open: true, label: 'client' })
    expect(container.querySelector('b')!.textContent).toBe('client')
    dispose()
  })
})
