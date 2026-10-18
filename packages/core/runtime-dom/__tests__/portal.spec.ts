import { createSignal } from '@zeus-js/signal'
import { effect, onCleanup } from '@zeus-js/signal/internal'
import { Portal, render } from '@zeus-js/zeus'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createComponent } from '../src'

describe('Portal', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('DocumentFragment', dom.window.DocumentFragment)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('mounts static children into the target and leaves a source placeholder', () => {
    const source = document.createElement('main')
    const target = document.createElement('div')
    const foreign = document.createElement('aside')
    foreign.textContent = 'foreign'
    target.append(foreign)
    document.body.append(source, target)

    const dispose = render(
      () =>
        Portal({
          target,
          children: document.createElement('span'),
        }),
      source,
    )

    expect(source.childNodes).toHaveLength(1)
    expect(source.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
    expect(target.querySelector('span')).not.toBeNull()
    expect(target.firstElementChild).toBe(foreign)

    dispose()

    expect(target.querySelector('span')).toBeNull()
    expect(target.firstElementChild).toBe(foreign)
  })

  it('replaces reactive children and disposes the range with render', () => {
    const source = document.createElement('main')
    const target = document.createElement('div')
    document.body.append(source, target)
    const [value, setValue] = createSignal<HTMLElement | null>(
      document.createElement('span'),
    )
    const dispose = render(
      () => Portal({ target, children: () => value() }),
      source,
    )

    const first = target.querySelector('span')
    expect(first).not.toBeNull()

    const second = document.createElement('strong')
    setValue(second)

    expect(target.querySelector('span')).toBeNull()
    expect(target.querySelector('strong')).toBe(second)

    dispose()

    expect(target.querySelector('strong')).toBeNull()
  })

  it('rejects missing or cross-document targets', () => {
    const source = document.createElement('main')
    const other = new JSDOM('<!doctype html><html><body></body></html>')

    expect(() =>
      render(() => Portal({ target: null as never, children: 'bad' }), source),
    ).toThrow('ZEUS_PORTAL_TARGET_INVALID')

    expect(() =>
      render(
        () =>
          Portal({
            target: other.window.document.body,
            children: 'bad',
          }),
        source,
      ),
    ).toThrow('ZEUS_PORTAL_TARGET_INVALID')

    other.window.close()
  })

  it('owns nested component effects and cleanup inside each portal replacement', () => {
    const source = document.createElement('main')
    const target = document.createElement('div')
    document.body.append(source, target)
    const [active, setActive] = createSignal('first')
    const [pulse, setPulse] = createSignal(0)
    const effectRuns: string[] = []
    const cleanups: string[] = []

    function Child(props: { id: string }) {
      effect(() => {
        pulse()
        effectRuns.push(props.id)
      })
      onCleanup(() => cleanups.push(props.id))
      const span = document.createElement('span')
      span.dataset.id = props.id
      return span
    }

    const portalProps = {
      target,
      get children() {
        return createComponent(Child, { id: active() })
      },
    }

    const dispose = render(() => Portal(portalProps), source)

    expect(effectRuns).toEqual(['first'])
    setActive('second')
    expect(cleanups).toEqual(['first'])
    expect(effectRuns).toEqual(['first', 'second'])
    expect(target.querySelector('[data-id="first"]')).toBeNull()
    expect(target.querySelector('[data-id="second"]')).not.toBeNull()

    effectRuns.length = 0
    setPulse(1)
    expect(effectRuns).toEqual(['second'])

    dispose()
    expect(cleanups).toEqual(['first', 'second'])
  })

  it('requires a render scope before allocating target nodes', () => {
    const target = document.createElement('div')
    const children = vi.fn(() => 'outside')

    expect(() => Portal({ target, children })).toThrow(
      'ZEUS_PORTAL_SCOPE_REQUIRED',
    )
    expect(children).not.toHaveBeenCalled()
    expect(target.childNodes).toHaveLength(0)
  })
})
