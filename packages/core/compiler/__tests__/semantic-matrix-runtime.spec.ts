import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import * as runtimeDOM from '@zeus-js/runtime-dom'
import * as runtimeSSR from '@zeus-js/runtime-ssr'
import * as signal from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  canonicalHTML,
  compile,
  compileOk,
  FILENAME,
  generatedPosition,
  htmlMarkerIds,
  installJSDOM,
  loadModule,
  planNodeIds,
  pointAt,
  removeDOMGlobals,
  stripHydrationMarkers,
} from './matrix-harness'

/**
 * Runtime, parity, escaping, hydration-plan and source-map cells of
 * `docs/internal/compiler-semantic-matrix.md`. Each fixture is compiled by the
 * native binary for both targets; DOM output runs in JSDOM through
 * `@zeus-js/runtime-dom`, SSR output runs through `@zeus-js/runtime-ssr` with
 * every DOM global removed. A real browser is not available in this suite.
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
const BUILTINS = "import { Show, For } from '@zeus-js/zeus'\r\n"

let jsdom: JSDOM

beforeAll(() => {
  // One document for the whole file: delegated listeners registered by
  // runtime-dom stay attached to it across fixtures.
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

function mount(
  module: AppModule,
  props: Props,
): { container: HTMLElement; dispose(): void } {
  const container = document.createElement('div')
  document.body.append(container)
  const dispose = runtimeDOM.render(
    () => module.App(props) as runtimeDOM.JSXValue,
    container,
  )
  return { container, dispose }
}

function canonicalSSR(html: string): string {
  const parsed = document.createElement('div')
  parsed.innerHTML = html
  return canonicalHTML(parsed.childNodes)
}

interface ParityFixture {
  /** Matrix row name. */
  name: string
  source: string
  initial: Props
  next: Props
  /** Element that must survive the update: components never re-render. */
  stable: string
}

const parityFixtures: ParityFixture[] = [
  {
    name: 'native element, attributes, text and template literals',
    source:
      'export const App = props => <section id="s" title={`t-${props.title}`} data-n={props.n}>Hello {props.name}! {`n=${props.n}`}</section>',
    initial: { title: 'a', n: 1, name: '<b>Ada</b> & "Q"' },
    next: { title: 'b', n: 2, name: 'Grace' },
    stable: 'section',
  },
  {
    name: 'class and style objects',
    source:
      'export const App = props => <div class={{ on: props.on, off: !props.on }} style={{ color: props.color, lineHeight: 2 }}>x</div>',
    initial: { on: true, color: 'red' },
    next: { on: false, color: 'blue' },
    stable: 'div',
  },
  {
    name: 'custom element tag with attributes and slotted children',
    source:
      'export const App = props => <z-matrix-card value={props.v} data-x="1"><span slot="title">{props.label}</span></z-matrix-card>',
    initial: { v: 'one', label: 'first' },
    next: { v: 'two', label: 'second' },
    stable: 'z-matrix-card',
  },
  {
    name: 'root and nested fragments',
    source:
      'export const App = props => <><b>{props.a}</b>text<><i>{props.a}</i></></>',
    initial: { a: 'x' },
    next: { a: 'y' },
    stable: 'b',
  },
  {
    name: 'JSX conditional and logical expressions',
    source:
      'export const App = props => <div>{props.ok ? <b>yes</b> : <i>no</i>}{props.ok && <u>{props.label}</u>}</div>',
    initial: { ok: true, label: 'shown' },
    next: { ok: false, label: 'hidden' },
    stable: 'div',
  },
  {
    name: 'Show and For control flow',
    source:
      BUILTINS +
      'export const App = props => <main><Show when={props.ok} fallback={<i>off</i>}><b>{props.a}</b></Show><ul><For each={props.items}>{(item, index) => <li data-i={index}>{item}</li>}</For></ul></main>',
    initial: { ok: true, a: 'on', items: ['a', 'b'] },
    next: { ok: false, a: 'on', items: ['b', 'c', 'd'] },
    stable: 'main',
  },
  {
    name: 'Array.map JSX region',
    source:
      'export const App = props => <ul>{props.items.map(item => <li>{item}</li>)}</ul>',
    initial: { items: ['a', 'b'] },
    next: { items: ['c'] },
    stable: 'ul',
  },
  {
    name: 'component props and children',
    source:
      'const Child = props => <p title={props.t}>{props.children}</p>\r\nexport const App = props => <section><Child t={props.title}><b>{props.name}</b></Child></section>',
    initial: { title: 't1', name: 'Ada' },
    next: { title: 't2', name: 'Grace' },
    stable: 'section',
  },
  {
    name: 'SVG namespace',
    source:
      'export const App = props => <svg viewBox="0 0 10 10"><circle r={props.r} /></svg>',
    initial: { r: 1 },
    next: { r: 2 },
    stable: 'svg',
  },
  {
    name: 'ordered native spread',
    source:
      'export const App = props => <div {...props.base} id="fixed" data-k={props.k} />',
    initial: { base: { id: 'base', title: 't1', class: 'c1' }, k: '1' },
    next: { base: { title: 't2' }, k: '2' },
    stable: 'div',
  },
]

describe('compiler semantic matrix: DOM/SSR parity', () => {
  for (const fixture of parityFixtures) {
    it(`${fixture.name}: DOM matches SSR before and after updates`, async () => {
      const dom = compileOk(fixture.source, 'dom')
      const ssr = compileOk(fixture.source, 'ssr')

      expect(ssr.hydrationPlan).not.toBeNull()
      expect(dom.hydrationPlan).toEqual(ssr.hydrationPlan)
      expect(ssr.code).not.toMatch(/\b(?:document|window)\b/)

      const render = await loadSSR(ssr.code, `${fixture.name}:ssr`)
      const initialHTML = render(fixture.initial)
      const nextHTML = render(fixture.next)

      // Every server marker is a planned node, every always-rendered planned
      // node has exactly one marker, and only optional (list/branch) nodes may
      // repeat: hydratePlan binds each repeated marker as one occurrence.
      const planNodes = ssr.hydrationPlan!.components.flatMap(
        component => component.nodes,
      )
      const planIds = planNodeIds(ssr.hydrationPlan)
      const markers = htmlMarkerIds(initialHTML)
      for (const id of markers) expect(planIds).toContain(id)
      for (const node of planNodes) {
        const count = markers.filter(id => id === node.id).length
        if (!node.optional) expect(count, node.id).toBe(1)
        else if (count > 1) expect(node.optional, node.id).toBe(true)
      }

      const module = await loadDOM(dom.code, `${fixture.name}:dom`)
      const { props, set } = reactiveProps(fixture.initial)
      const { container, dispose } = mount(module, props)
      try {
        expect(canonicalHTML(container.childNodes)).toBe(
          canonicalSSR(initialHTML),
        )
        const stable = container.querySelector(fixture.stable)
        expect(stable).not.toBeNull()

        set(fixture.next)
        expect(canonicalHTML(container.childNodes)).toBe(canonicalSSR(nextHTML))
        expect(container.querySelector(fixture.stable)).toBe(stable)
      } finally {
        dispose()
      }
    })
  }
})

describe('compiler semantic matrix: target-specific semantics', () => {
  it('escapes dynamic text and attributes in SSR and keeps DOM text literal', async () => {
    const source =
      'export const App = props => <p title={props.t} data-q="a &quot;b&quot;">{props.v}</p>'
    const value = '<img src=x onerror=alert(1)> & "q"'
    const render = await loadSSR(compileOk(source, 'ssr').code, 'escape:ssr')
    const html = stripHydrationMarkers(render({ t: value, v: value }))
    expect(html).toBe(
      '<p title="&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;" data-q="a &quot;b&quot;">&lt;img src=x onerror=alert(1)&gt; &amp; "q"</p>',
    )

    const module = await loadDOM(compileOk(source, 'dom').code, 'escape:dom')
    const { container, dispose } = mount(module, { t: value, v: value })
    const paragraph = container.querySelector('p')!
    expect(paragraph.querySelector('img')).toBeNull()
    expect(paragraph.textContent).toBe(value)
    expect(paragraph.getAttribute('title')).toBe(value)
    expect(paragraph.getAttribute('data-q')).toBe('a "b"')
    dispose()
  })

  it('keeps script and style raw text closed in SSR and literal in DOM', async () => {
    const source =
      'export const App = props => <main><script>{props.js}</script><style>{props.css}</style></main>'
    const js = 'const a = 1 < 2 && "&"; "</script><i>x</i>"'
    const css = '.x::before { content: "</style><i>y</i>" }'
    const ssr = compileOk(source, 'ssr')
    expect(compileOk(source, 'dom').hydrationPlan).toEqual(ssr.hydrationPlan)
    const render = await loadSSR(ssr.code, 'raw:ssr')
    const html = stripHydrationMarkers(render({ js, css }))
    expect(html).toBe(
      '<main><script>const a = 1 < 2 && "&"; "\\u003C/script><i>x</i>"</script><style>.x::before { content: "\\3C /style><i>y</i>" }</style></main>',
    )
    const parsed = new JSDOM(`<body>${html}</body>`).window.document
    expect(parsed.querySelectorAll('i')).toHaveLength(0)
    expect(parsed.querySelectorAll('main > *')).toHaveLength(2)

    const module = await loadDOM(compileOk(source, 'dom').code, 'raw:dom')
    const { container, dispose } = mount(module, { js, css })
    expect(container.querySelector('script')!.textContent).toBe(js)
    expect(container.querySelector('style')!.textContent).toBe(css)
    expect(container.querySelector('i')).toBeNull()
    dispose()
  })

  it('keeps once bindings fixed in DOM while marking them in both plans', async () => {
    const source =
      'export const App = props => <div title={once(props.t)}><b>{once(props.v)}</b><i>{props.v}</i></div>'
    const dom = compileOk(source, 'dom')
    const ssr = compileOk(source, 'ssr')
    expect(dom.hydrationPlan).toEqual(ssr.hydrationPlan)
    const bindings = dom.hydrationPlan!.components[0].nodes.flatMap(
      node => node.bindings,
    )
    expect(bindings.map(binding => [binding.kind, binding.once])).toEqual([
      ['attr', true],
      ['text', true],
      ['text', false],
    ])

    const render = await loadSSR(ssr.code, 'once:ssr')
    expect(stripHydrationMarkers(render({ t: 'a', v: 'one' }))).toBe(
      '<div title="a"><b>one</b><i>one</i></div>',
    )

    const module = await loadDOM(dom.code, 'once:dom')
    const { props, set } = reactiveProps({ t: 'a', v: 'one' })
    const { container, dispose } = mount(module, props)
    set({ t: 'b', v: 'two' })
    expect(container.innerHTML).toBe(
      '<div title="a"><b>one</b><i>two</i></div>',
    )
    dispose()
  })

  it('binds refs and events in DOM and omits them from SSR', async () => {
    const source =
      'export const App = props => <button ref={props.r} onClick={props.h} data-x={props.x}>go</button>'
    const dom = compileOk(source, 'dom')
    const ssr = compileOk(source, 'ssr')
    expect(dom.hydrationPlan).toEqual(ssr.hydrationPlan)
    expect(ssr.code).not.toContain('props.h')
    expect(ssr.code).not.toContain('props.r')

    const render = await loadSSR(ssr.code, 'events:ssr')
    const noop = () => {}
    expect(stripHydrationMarkers(render({ r: noop, h: noop, x: 1 }))).toBe(
      '<button data-x="1">go</button>',
    )

    const module = await loadDOM(dom.code, 'events:dom')
    const refs: Array<Element | null> = []
    const targets: Array<EventTarget | null> = []
    const { container, dispose } = mount(module, {
      r: (element: Element | null) => refs.push(element),
      h: (event: Event) => targets.push(event.currentTarget),
      x: 1,
    })
    const button = container.querySelector('button')!
    expect(button.getAttributeNames()).toEqual(['data-x'])
    button.dispatchEvent(
      new jsdom.window.MouseEvent('click', { bubbles: true }),
    )
    expect(targets).toEqual([button])
    expect(refs).toEqual([button])
    dispose()
    expect(refs).toEqual([button, null])
  })

  it('serializes supported SSR form properties and sets DOM properties', async () => {
    const source =
      'export const App = props => <form><input prop:value={props.v} prop:checked={props.c} prop:disabled={props.d} /><label prop:htmlFor={props.f}>l</label></form>'
    const render = await loadSSR(compileOk(source, 'ssr').code, 'prop:ssr')
    expect(
      stripHydrationMarkers(render({ v: 'a"b', c: true, d: false, f: 'id' })),
    ).toBe(
      '<form><input value="a&quot;b" checked><label for="id">l</label></form>',
    )

    const module = await loadDOM(compileOk(source, 'dom').code, 'prop:dom')
    const { props, set } = reactiveProps({
      v: 'one',
      c: true,
      d: false,
      f: 'a',
    })
    const { container, dispose } = mount(module, props)
    const input = container.querySelector('input')!
    expect([input.value, input.checked, input.disabled]).toEqual([
      'one',
      true,
      false,
    ])
    set({ v: 'two', c: false, d: true, f: 'b' })
    expect([input.value, input.checked, input.disabled]).toEqual([
      'two',
      false,
      true,
    ])
    expect(container.querySelector('label')!.htmlFor).toBe('b')
    dispose()
  })
})

describe('compiler semantic matrix: hydration plan', () => {
  it('reconnects every planned binding to server HTML without replacing nodes', async () => {
    const source =
      BUILTINS +
      'export const App = props => <main title={props.title}><input prop:value={props.v} onInput={props.h} /><b>{props.a}</b><Show when={props.ok}><em>{props.e}</em></Show></main>'
    const dom = compileOk(source, 'dom')
    const ssr = compileOk(source, 'ssr')
    expect(dom.hydrationPlan).toEqual(ssr.hydrationPlan)
    const plan = ssr.hydrationPlan!

    const render = await loadSSR(ssr.code, 'hydrate:ssr')
    const html = render({ title: 't', v: 'server', a: 'A', ok: true, e: 'E' })

    installJSDOM(jsdom)
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const main = container.querySelector('main')!
    const input = container.querySelector('input')!
    const bold = container.querySelector('b')!

    const [state, setState] = signal.createSignal({ title: 'c', a: 'B' })
    const inputs: string[] = []
    const kinds = new Set<string>()
    const handlers: Record<number, runtimeDOM.HydrationBindingHandler> = {}
    for (const node of plan.components.flatMap(component => component.nodes)) {
      for (const binding of node.bindings) {
        handlers[binding.id] = (context, current, planned, occurrence) => {
          kinds.add(`${planned.tagName ?? planned.kind}:${current.kind}`)
          if (current.kind === 'attr') {
            context.attr(
              planned.id,
              current.name!,
              () => state().title,
              occurrence,
            )
          } else if (current.kind === 'prop') {
            context.prop(planned.id, current.name!, () => 'client', occurrence)
          } else if (current.kind === 'event') {
            context.event(
              planned.id,
              current.name!,
              event => inputs.push((event.target as HTMLInputElement).value),
              occurrence,
            )
          } else if (current.kind === 'text') {
            context.text(
              planned.id,
              () => (planned.optional ? 'E2' : state().a),
              occurrence,
            )
          }
        }
      }
    }

    const dispose = runtimeDOM.hydratePlan(container, plan, handlers)
    expect(Array.from(kinds).sort()).toEqual([
      'input:event',
      'input:prop',
      'main:attr',
      'text:text',
    ])
    expect(container.querySelector('main')).toBe(main)
    expect(container.querySelector('input')).toBe(input)
    expect(container.querySelector('b')).toBe(bold)
    expect(main.title).toBe('c')
    expect(input.value).toBe('client')
    expect(bold.textContent).toBe('B')
    expect(container.querySelector('em')!.textContent).toBe('E2')

    setState({ title: 'd', a: 'C' })
    expect(main.title).toBe('d')
    expect(bold.textContent).toBe('C')
    input.dispatchEvent(new jsdom.window.Event('input', { bubbles: true }))
    expect(inputs).toEqual(['client'])

    dispose()
    setState({ title: 'e', a: 'D' })
    expect(bold.textContent).toBe('C')
  })

  it('assigns stable IDs that do not depend on the target or repeated compiles', () => {
    const source =
      BUILTINS +
      'const Row = props => <li>{props.label}</li>\r\nexport const App = props => <ul><For each={props.items}>{item => <Row label={item} />}</For>{props.tail}</ul>'
    const plans = [
      compileOk(source, 'dom').hydrationPlan,
      compileOk(source, 'ssr').hydrationPlan,
      compileOk(source, 'dom', { delegateEvents: false }).hydrationPlan,
      compileOk(source, 'dom', { sourceMap: false }).hydrationPlan,
    ]
    for (const plan of plans.slice(1)) expect(plan).toEqual(plans[0])
    // Component IDs reuse the module-wide node counter, so they are stable but
    // not consecutive.
    expect(plans[0]!.components.map(component => component.templateId)).toEqual(
      ['c1.root', 'c4.root'],
    )
  })
})

describe('compiler semantic matrix: source maps', () => {
  const source = [
    BUILTINS.trimEnd(),
    '// \u{1f600}中 prefix keeps UTF-16 columns and CRLF line counting honest',
    'const Child = p => <i>{p.childText}</i>',
    'export const App = props => (',
    '  <main title={props.alpha} class={{ on: props.beta }} {...props.gamma}>',
    '    \u{1f600} {props.delta} <input prop:value={props.epsilon} onInput={props.zeta} />',
    '    <Show when={props.eta} fallback={<b>{props.theta}</b>}>{props.iota}</Show>',
    '    <For each={props.kappa}>{item => <li data-id={item.lambda}>{item.mu}</li>}</For>',
    '    <Child childText={props.nu} />{`tpl ${props.xi}`}{props.omicron ? <u>{props.pi}</u> : null}',
    '  </main>',
    ')',
  ].join('\r\n')
  const expressions = [
    'p.childText',
    'props.alpha',
    'props.beta',
    'props.gamma',
    'props.delta',
    'props.epsilon',
    'props.zeta',
    'props.eta',
    'props.theta',
    'props.iota',
    'props.kappa',
    'item.lambda',
    'item.mu',
    'props.nu',
    'props.xi',
    'props.omicron',
    'props.pi',
  ]

  for (const target of ['dom', 'ssr'] as const) {
    it(`maps every ${target} expression back to the original line and column`, () => {
      const result = compileOk(source, target)
      const map = result.map!
      expect(map.version).toBe(3)
      expect(map.sources).toEqual([FILENAME])
      expect(map.sourcesContent).toEqual([source])
      const traceMap = new TraceMap(
        map as ConstructorParameters<typeof TraceMap>[0],
      )

      // Events are client-only, so SSR output does not contain the handler.
      const names =
        target === 'ssr'
          ? expressions.filter(name => name !== 'props.zeta')
          : expressions
      for (const name of names) {
        const generatedIndex = result.code.indexOf(name)
        expect(generatedIndex, name).toBeGreaterThan(-1)
        const traced = originalPositionFor(
          traceMap,
          generatedPosition(result.code, generatedIndex),
        )
        const original = pointAt(source, source.indexOf(name))
        expect(
          { name, line: traced.line, column: traced.column },
          name,
        ).toEqual({ name, line: original.line, column: original.column })
        expect(traced.source).toBe(FILENAME)
      }
    })

    it(`does not attribute ${target} runtime helpers to the first source line`, () => {
      const result = compileOk(source, target)
      const traceMap = new TraceMap(
        result.map! as ConstructorParameters<typeof TraceMap>[0],
      )
      const helper =
        target === 'dom' ? '$zeusTemplate(' : '$zeusHydrationMarker('
      const index = result.code.indexOf(helper, result.code.indexOf('\n'))
      expect(index).toBeGreaterThan(-1)
      expect(
        originalPositionFor(traceMap, generatedPosition(result.code, index))
          .line,
      ).toBeNull()
    })
  }
})

describe('compiler semantic matrix: Web Components and async values', () => {
  it('compiles defineElement Host and Slot for both targets from one plan', async () => {
    const source =
      "import { defineElement, Host, Slot } from '@zeus-js/zeus'\r\n" +
      "export const Card = defineElement('z-matrix-slot', { shadow: true, props: { heading: String } }, props => (\r\n" +
      '  <Host role="group"><header><Slot name="title">Untitled</Slot></header><p>{props.heading}</p><Slot /></Host>\r\n' +
      '))'
    const dom = compileOk(source, 'dom')
    const ssr = compileOk(source, 'ssr')
    expect(dom.hydrationPlan).toEqual(ssr.hydrationPlan)
    expect(ssr.code).not.toMatch(/\b(?:document|window|customElements)\b/)

    removeDOMGlobals()
    const server = await loadModule<{
      Card(props: Props): runtimeSSR.SSRNode
    }>(ssr.code, 'slot:ssr', ssrModules)
    const html = stripHydrationMarkers(
      runtimeSSR.renderToString(() =>
        server.Card({
          heading: '<T>',
          children: [
            runtimeSSR.ssrElement(
              'b',
              [runtimeSSR.ssrAttr('slot', 'title')],
              'Named',
            ),
            runtimeSSR.ssrElement('i', [], 'Body'),
          ],
        }),
      ),
    )
    expect(html).toBe(
      '<z-matrix-slot heading="&lt;T&gt;" role="group"><template shadowrootmode="open"><header><slot name="title">Untitled</slot></header><p>&lt;T&gt;</p><slot></slot></template><b slot="title">Named</b><i>Body</i></z-matrix-slot>',
    )

    await loadDOM(dom.code, 'slot:dom')
    const host = document.createElement('z-matrix-slot')
    host.setAttribute('heading', 'first')
    host.innerHTML = '<b slot="title">Named</b><i>Body</i>'
    document.body.append(host)
    const shadow = host.shadowRoot!
    expect(host.getAttribute('role')).toBe('group')
    const paragraph = shadow.querySelector('p')!
    expect(paragraph.textContent).toBe('first')
    const named = shadow.querySelector('slot[name="title"]') as HTMLSlotElement
    expect(named.assignedNodes()).toEqual([host.querySelector('b')])
    host.setAttribute('heading', 'second')
    expect(shadow.querySelector('p')).toBe(paragraph)
    expect(paragraph.textContent).toBe('second')
    host.remove()
  })

  it('never renders an async component silently in either target', async () => {
    const source = 'export const App = async props => <div>{props.a}</div>'
    for (const target of ['dom', 'ssr'] as const) {
      const result = compile(source, target)
      // A compile-time diagnostic is the documented goal (matrix GAP); until
      // the compiler reports one, each runtime must reject the Promise.
      if (result.diagnostics.length > 0) {
        expect(result.diagnostics[0].severity).toBe('error')
        expect(result.diagnostics[0].span).toBeDefined()
        continue
      }
      if (target === 'ssr') {
        const render = await loadSSR(result.code, 'async:ssr')
        expect(() => render({ a: 'x' })).toThrow(
          'renderToString() does not support async render values.',
        )
      } else {
        const module = await loadDOM(result.code, 'async:dom')
        expect(() => mount(module, { a: 'x' })).toThrow(
          'JSX children cannot contain Promises',
        )
      }
    }
  })
})
