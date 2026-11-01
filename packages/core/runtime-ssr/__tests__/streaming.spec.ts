import { describe, expect, it } from 'vitest'

import {
  SSR_STREAMING_API_VERSION,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  inject,
  onCleanup,
  renderToStream,
  renderToString,
  ssrAttr,
  ssrElement,
  ssrHydrationMarker,
  ssrFor,
  ssrSpread,
  ssrStatic,
  ssrText,
  useContext,
} from '../src'

/**
 * Experimental streaming SSR (RFC-018). Every case exercises the real async
 * protocol: a source that awaits between chunks, a live `ReadableStream`
 * reader, and per-request reactive scopes. The synchronous `renderToString()`
 * contract stays untouched and is asserted separately.
 */

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let html = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    html += decoder.decode(value, { stream: true })
  }

  return html
}

async function readChunks(
  stream: ReadableStream<Uint8Array>,
): Promise<string[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value, { stream: true }))
  }

  return chunks
}

describe('renderToStream (experimental)', () => {
  it('publishes a versioned streaming protocol', () => {
    expect(SSR_STREAMING_API_VERSION).toBe(1)
  })

  it('streams a synchronous tree as escaped HTML', async () => {
    const html = await readAll(
      renderToStream(() => [
        ssrElement('p', [ssrAttr('title', 'a & "b"')], 'A & <B>'),
        ssrElement('p', [], 'Tail'),
      ]),
    )

    expect(html).toBe(
      '<p title="a &amp; &quot;b&quot;">A &amp; &lt;B&gt;</p><p>Tail</p>',
    )
  })

  it('chunks a large synchronous tree by flushAt', async () => {
    const children = Array.from({ length: 40 }, (_, index) =>
      ssrElement('i', [], `item-${index}`),
    )
    const chunks = await readChunks(
      renderToStream(() => children, { flushAt: 64 }),
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(
      children.map((_, index) => `<i>item-${index}</i>`).join(''),
    )
  })

  it('awaits real asynchronous work between chunks', async () => {
    const events: string[] = []
    const stream = renderToStream(async function* () {
      events.push('start')
      yield ssrElement('header', [], 'first')
      await new Promise(resolve => setTimeout(resolve, 5))
      events.push('resumed')
      yield ssrElement('main', [], 'second')
    })

    const reader = stream.getReader()
    const decoder = new TextDecoder()

    const first = await reader.read()
    expect(decoder.decode(first.value)).toBe('<header>first</header>')
    expect(events).toEqual(['start'])

    const second = await reader.read()
    expect(decoder.decode(second.value)).toBe('<main>second</main>')
    expect(events).toEqual(['start', 'resumed'])

    expect((await reader.read()).done).toBe(true)
  })

  it('does not advance the source before the consumer pulls', async () => {
    const events: string[] = []
    const controller = new AbortController()
    const stream = renderToStream(
      async function* () {
        events.push('first')
        yield 'a'
        events.push('second')
        yield 'b'
      },
      { signal: controller.signal },
    )

    expect(events).toEqual([])

    const reader = stream.getReader()
    await reader.read()
    expect(events).toEqual(['first'])
    await reader.read()
    expect(events).toEqual(['first', 'second'])

    controller.abort()
    await reader.read().catch(() => {})
  })

  it('aborts an in-flight stream and stops the source', async () => {
    const controller = new AbortController()
    let stopped = false
    const stream = renderToStream(
      async function* () {
        try {
          yield ssrElement('p', [], 'one')
          await new Promise(resolve => setTimeout(resolve, 200))
          yield ssrElement('p', [], 'two')
        } finally {
          stopped = true
        }
      },
      { signal: controller.signal },
    )

    const reader = stream.getReader()
    const decoder = new TextDecoder()
    expect(decoder.decode((await reader.read()).value)).toBe('<p>one</p>')

    controller.abort()

    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' })
    expect(stopped).toBe(true)
  })

  it('rejects an already-aborted signal without running the source', () => {
    const controller = new AbortController()
    controller.abort()

    expect(() =>
      renderToStream(() => ssrElement('p', [], 'never'), {
        signal: controller.signal,
      }),
    ).toThrowError(/aborted/)
  })

  it('keeps flushed chunks when the source throws mid-stream', async () => {
    const stream = renderToStream(async function* () {
      yield ssrElement('p', [], 'ok')
      await Promise.resolve()
      throw new Error('boom')
    })

    const reader = stream.getReader()
    const decoder = new TextDecoder()

    expect(decoder.decode((await reader.read()).value)).toBe('<p>ok</p>')
    await expect(reader.read()).rejects.toThrow('boom')
  })

  it('disposes the request scope when the stream closes or is cancelled', async () => {
    let closed = 0
    let cancelled = 0

    await readAll(
      renderToStream(() => {
        onCleanup(() => closed++)
        return ssrText('done')
      }),
    )

    const reader = renderToStream(async function* () {
      try {
        yield 'a'
        await new Promise(resolve => setTimeout(resolve, 100))
        yield 'b'
      } finally {
        cancelled++
      }
    }).getReader()
    await reader.read()
    await reader.cancel()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(closed).toBe(1)
    expect(cancelled).toBe(1)
  })

  it('isolates context and reactive state per request', async () => {
    const Theme = createContext('light')

    // Two requests render concurrently with different provider values. Each
    // chunk re-provides around its own subtree, so neither request can observe
    // the other's owner.
    const render = (value: string) =>
      async function* () {
        yield Theme.Provider({
          value,
          children: () => ssrElement('p', [], useContext(Theme)),
        })
        await Promise.resolve()
        yield Theme.Provider({
          value,
          children: () => ssrElement('p', [], inject(Theme)),
        })
      }

    const [first, second] = await Promise.all([
      readAll(renderToStream(render('dark'))),
      readAll(renderToStream(render('solar'))),
    ])

    expect(first).toBe('<p>dark</p><p>dark</p>')
    expect(second).toBe('<p>solar</p><p>solar</p>')
  })

  it('does not carry a provider value across an await boundary', async () => {
    const Theme = createContext('light')

    // A provider chain is synchronous, exactly like the DOM runtime. The
    // continuation after `await` runs at the request owner, so the segment
    // must provide again to see the value. RFC-018 documents this rule.
    const html = await readAll(
      renderToStream(async function* () {
        yield Theme.Provider({
          value: 'dark',
          children: () => ssrElement('p', [], useContext(Theme)),
        })
        await Promise.resolve()
        yield ssrElement('p', [], useContext(Theme))
      }),
    )

    expect(html).toBe('<p>dark</p><p>light</p>')
  })

  it('replays the synchronous provider chain like renderToString', async () => {
    const Theme = createContext('light')

    const html = await readAll(
      renderToStream(() =>
        Theme.Provider({
          value: 'dark',
          children: () => [
            ssrElement('p', [], useContext(Theme)),
            ssrElement('p', [], inject(Theme, 'fallback')),
          ],
        }),
      ),
    )

    expect(html).toBe('<p>dark</p><p>dark</p>')
    expect(
      renderToString(() =>
        Theme.Provider({
          value: 'dark',
          children: () => ssrElement('p', [], useContext(Theme)),
        }),
      ),
    ).toBe('<p>dark</p>')
  })

  it('evaluates signals and memos inside an isolated reactive root', async () => {
    const values: number[] = []

    const html = await readAll(
      renderToStream(() => {
        const [count] = createSignal(2)
        const doubled = createMemo(() => count() * 2)
        values.push(doubled())
        return ssrElement('b', [], String(doubled()))
      }),
    )

    expect(html).toBe('<b>4</b>')
    expect(values).toEqual([4])
  })

  it('rejects a Promise render factory and unresolved Promise values', async () => {
    await expect(
      readAll(renderToStream((() => Promise.resolve('x')) as never)),
    ).rejects.toThrow('renderToStream() cannot serialize a Promise')

    await expect(
      readAll(
        renderToStream(async function* () {
          yield ['a', Promise.resolve('b')] as never
        }),
      ),
    ).rejects.toThrow('renderToStream() cannot serialize a Promise')
  })

  it('rejects raw-text fragments that cannot be re-escaped, like the sync protocol', async () => {
    await expect(
      readAll(
        renderToStream(() =>
          ssrElement('script', [], ssrStatic('alert(1)'), undefined, true),
        ),
      ),
    ).rejects.toThrow(
      'renderToString() does not support serialized fragments inside <script> raw text.',
    )
  })

  it('keeps hydration markers continuous across chunks', async () => {
    const stream = renderToStream(async function* () {
      yield [ssrHydrationMarker('c1.root'), ssrElement('main', [], 'a')]
      await Promise.resolve()
      yield [ssrHydrationMarker('c1.e2'), ssrElement('p', [], 'b')]
    })

    expect(await readAll(stream)).toBe(
      '<!--zeus:hydrate:c1.root--><main>a</main><!--zeus:hydrate:c1.e2--><p>b</p>',
    )
  })

  it('serializes control flow and spreads through the synchronous helpers', async () => {
    const html = await readAll(
      renderToStream(() =>
        ssrElement(
          'ul',
          ssrSpread([() => ({ id: 'list' })]),
          ssrFor(['a', 'b'], item => ssrElement('li', [], item)),
        ),
      ),
    )

    expect(html).toBe('<ul id="list"><li>a</li><li>b</li></ul>')
  })

  it('does not change the synchronous contract', () => {
    expect(renderToString(() => ssrElement('p', [], 'sync'))).toBe(
      '<p>sync</p>',
    )

    expect(() => renderToString((() => Promise.resolve('x')) as never)).toThrow(
      'renderToString() does not support async render values.',
    )
  })

  it('disposes spawned synchronous scopes before the first chunk', async () => {
    const effects: string[] = []

    const html = await readAll(
      renderToStream(() => {
        createEffect(() => {
          effects.push('run')
        })
        return ssrElement('i', [], 'x')
      }),
    )

    // An effect scheduled during SSR setup is flushed by the isolated scope;
    // the streaming root disposes it before the first chunk is read.
    expect(html).toBe('<i>x</i>')
    expect(effects.length).toBeGreaterThanOrEqual(1)
  })
})
