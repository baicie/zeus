import { describe, expect, it } from 'vitest'

import { createRendererHost } from '../src/renderer'

import type { RendererSession } from '../src/renderer'

interface Data {
  label: string
}

interface Context {
  owner: string
}

interface Call {
  type: 'mount' | 'update' | 'dispose'
  container?: string
  data?: Data
  context?: Context
  handle?: unknown
}

function createAdapter(calls: Call[]) {
  let nextHandle = 0
  return {
    mount(
      container: string,
      data: Data,
      context: Context,
      _session: RendererSession,
    ) {
      const handle = { id: ++nextHandle }
      calls.push({ type: 'mount', container, data, context, handle })
      return handle
    },
    update(handle: unknown, data: Data, context: Context) {
      calls.push({ type: 'update', data, context, handle })
    },
    dispose(handle: unknown) {
      calls.push({ type: 'dispose', handle })
    },
  }
}

function entry(
  key: PropertyKey,
  container: string,
  label: string,
  owner = 'grid',
) {
  return {
    key,
    container,
    data: { label },
    context: { owner },
  }
}

describe('renderer adapter contract', () => {
  it('mounts, updates, and disposes keyed entries while preserving handles', () => {
    const calls: Call[] = []
    const adapter = createAdapter(calls)
    const host = createRendererHost(adapter)

    host.render([entry('a', 'cell-a', 'A'), entry('b', 'cell-b', 'B')])
    const firstHandles = calls
      .filter(call => call.type === 'mount')
      .map(call => call.handle)

    host.render([entry('b', 'cell-b', 'B2'), entry('a', 'cell-a', 'A2')])

    expect(calls.filter(call => call.type === 'mount')).toHaveLength(2)
    expect(calls.filter(call => call.type === 'update')).toEqual([
      {
        type: 'update',
        data: { label: 'B2' },
        context: { owner: 'grid' },
        handle: firstHandles[1],
      },
      {
        type: 'update',
        data: { label: 'A2' },
        context: { owner: 'grid' },
        handle: firstHandles[0],
      },
    ])

    host.render([])
    expect(calls.filter(call => call.type === 'dispose')).toEqual(
      expect.arrayContaining([
        { type: 'dispose', handle: firstHandles[0] },
        { type: 'dispose', handle: firstHandles[1] },
      ]),
    )
  })

  it('disposes removed entries once and mounts a fresh handle when the key returns', () => {
    const calls: Call[] = []
    const host = createRendererHost(createAdapter(calls))

    host.render([entry('stable', 'cell', 'first')])
    const firstHandle = calls[0].handle
    host.render([])
    host.render([])
    host.render([entry('stable', 'cell', 'second')])

    expect(calls.filter(call => call.type === 'dispose')).toEqual([
      { type: 'dispose', handle: firstHandle },
    ])
    expect(calls.filter(call => call.type === 'mount')).toHaveLength(2)
    expect(calls.filter(call => call.type === 'update')).toHaveLength(0)
  })

  it('remounts a stable key when its container changes', () => {
    const calls: Call[] = []
    const host = createRendererHost(createAdapter(calls))

    host.render([entry('a', 'cell-a', 'A')])
    const firstHandle = calls[0].handle
    host.render([entry('a', 'cell-a-next', 'A2')])

    expect(calls.filter(call => call.type === 'dispose')).toEqual([
      { type: 'dispose', handle: firstHandle },
    ])
    expect(calls.filter(call => call.type === 'mount')).toHaveLength(2)
  })

  it('swaps renderers by disposing old handles and mounting current entries', () => {
    const firstCalls: Call[] = []
    const secondCalls: Call[] = []
    const first = createAdapter(firstCalls)
    const second = createAdapter(secondCalls)
    const host = createRendererHost(first)

    host.render([entry('a', 'cell-a', 'A')])
    const firstHandle = firstCalls[0].handle
    host.setAdapter(second)

    expect(firstCalls.filter(call => call.type === 'dispose')).toEqual([
      { type: 'dispose', handle: firstHandle },
    ])
    expect(secondCalls.filter(call => call.type === 'mount')).toEqual([
      {
        type: 'mount',
        container: 'cell-a',
        data: { label: 'A' },
        context: { owner: 'grid' },
        handle: secondCalls[0].handle,
      },
    ])

    host.render([entry('a', 'cell-a', 'A2')])
    expect(secondCalls.filter(call => call.type === 'update')).toHaveLength(1)
    host.dispose()
    host.dispose()
    expect(secondCalls.filter(call => call.type === 'dispose')).toHaveLength(1)
    expect(() => host.render([entry('a', 'cell-a', 'A3')])).toThrow(
      '[ZEUS_RENDERER_DISPOSED] The renderer host has already been disposed.',
    )
    expect(secondCalls.filter(call => call.type === 'update')).toHaveLength(1)
  })

  it('rejects duplicate keys and rejects render after host disposal', () => {
    const calls: Call[] = []
    const host = createRendererHost(createAdapter(calls))

    expect(() =>
      host.render([entry('duplicate', 'a', 'A'), entry('duplicate', 'b', 'B')]),
    ).toThrow(
      '[ZEUS_RENDERER_DUPLICATE_KEY] Renderer key duplicate appears more than once.',
    )
    expect(calls).toHaveLength(0)

    host.dispose()
    expect(() => host.render([])).toThrow(
      '[ZEUS_RENDERER_DISPOSED] The renderer host has already been disposed.',
    )
    expect(() => host.setAdapter(createAdapter([]))).toThrow(
      '[ZEUS_RENDERER_DISPOSED] The renderer host has already been disposed.',
    )
  })

  it('keeps adapter calls independent from framework-specific vnode types', () => {
    const calls: Call[] = []
    const adapter = createAdapter(calls)
    const host = createRendererHost(adapter)
    const frameworkData = { label: 'VNode-like data' }

    host.render([
      {
        key: 'framework-cell',
        container: 'cell',
        data: frameworkData,
        context: { owner: 'react-or-vue' },
      },
    ])

    expect(calls[0]).toMatchObject({
      type: 'mount',
      container: 'cell',
      data: frameworkData,
      context: { owner: 'react-or-vue' },
    })
  })

  it('cleans active handles when update or mount fails', () => {
    const calls: Call[] = []
    let failMount = false
    const adapter = {
      ...createAdapter(calls),
      mount(
        container: string,
        data: Data,
        context: Context,
        session: RendererSession,
      ) {
        if (failMount) throw new Error('mount failed')
        return createAdapter(calls).mount(container, data, context, session)
      },
      update(handle: unknown, data: Data, context: Context) {
        calls.push({ type: 'update', data, context, handle })
        if (data.label === 'fail-update') throw new Error('update failed')
      },
    }
    const host = createRendererHost(adapter)

    host.render([entry('a', 'cell-a', 'A')])
    expect(() => host.render([entry('a', 'cell-a', 'fail-update')])).toThrow(
      'update failed',
    )
    expect(calls.filter(call => call.type === 'dispose')).toHaveLength(1)
    host.dispose()
    expect(calls.filter(call => call.type === 'dispose')).toHaveLength(1)

    failMount = true
    expect(() => host.render([entry('b', 'cell-b', 'B')])).toThrow(
      '[ZEUS_RENDERER_DISPOSED] The renderer host has already been disposed.',
    )
  })

  it('cleans already-mounted entries when a later mount fails', () => {
    const calls: Call[] = []
    const adapter = {
      ...createAdapter(calls),
      mount(container: string, data: Data, context: Context) {
        if (data.label === 'fail') throw new Error('mount failed')
        const handle = { container }
        calls.push({ type: 'mount', container, data, context, handle })
        return handle
      },
    }
    const host = createRendererHost(adapter)

    expect(() =>
      host.render([entry('a', 'cell-a', 'A'), entry('b', 'cell-b', 'fail')]),
    ).toThrow('mount failed')
    expect(calls.filter(call => call.type === 'dispose')).toHaveLength(1)
    host.dispose()
    expect(calls.filter(call => call.type === 'dispose')).toHaveLength(1)
  })

  it('retries a failed dispose before accepting another render', () => {
    const calls: Call[] = []
    let shouldFail = true
    const base = createAdapter(calls)
    const adapter = {
      ...base,
      dispose(handle: unknown) {
        calls.push({ type: 'dispose', handle })
        if (shouldFail) {
          shouldFail = false
          throw new Error('dispose failed')
        }
      },
    }
    const host = createRendererHost(adapter)

    host.render([entry('a', 'cell-a', 'A')])
    expect(() => host.render([])).toThrow('dispose failed')
    expect(() => host.render([])).not.toThrow()
    expect(calls.filter(call => call.type === 'dispose')).toHaveLength(2)
  })

  it('retains old entries when adapter disposal fails before a renderer swap', () => {
    const firstCalls: Call[] = []
    const secondCalls: Call[] = []
    let shouldFail = true
    const firstBase = createAdapter(firstCalls)
    let failHandle: unknown
    const first = {
      ...firstBase,
      dispose(handle: unknown) {
        firstCalls.push({ type: 'dispose', handle })
        if (shouldFail && handle === failHandle) {
          shouldFail = false
          throw new Error('old adapter dispose failed')
        }
      },
    }
    const second = createAdapter(secondCalls)
    const host = createRendererHost(first)

    host.render([entry('a', 'cell-a', 'A'), entry('b', 'cell-b', 'B')])
    failHandle = firstCalls.filter(call => call.type === 'mount')[1].handle
    expect(() => host.setAdapter(second)).toThrow(
      expect.objectContaining({
        message:
          '[ZEUS_RENDERER_ADAPTER_FAILURE] Renderer dispose failed for key b.',
        cause: expect.objectContaining({
          message: 'old adapter dispose failed',
        }),
      }),
    )
    expect(secondCalls.filter(call => call.type === 'mount')).toHaveLength(0)
    expect(firstCalls.filter(call => call.type === 'dispose')).toHaveLength(2)
    expect(() => host.render([])).toThrow(
      '[ZEUS_RENDERER_ADAPTER_FAILURE] A failed renderer adapter swap must complete before rendering.',
    )

    expect(() => host.setAdapter(second)).not.toThrow()
    expect(secondCalls.filter(call => call.type === 'mount')).toHaveLength(2)
    expect(firstCalls.filter(call => call.type === 'dispose')).toHaveLength(3)
    expect(
      firstCalls
        .filter(call => call.type === 'dispose')
        .map(call => call.handle),
    ).toEqual([
      firstCalls.filter(call => call.type === 'mount')[0].handle,
      failHandle,
      failHandle,
    ])
    expect(secondCalls.filter(call => call.type === 'mount')).toEqual([
      expect.objectContaining({
        container: 'cell-a',
        data: { label: 'A' },
        context: { owner: 'grid' },
      }),
      expect.objectContaining({
        container: 'cell-b',
        data: { label: 'B' },
        context: { owner: 'grid' },
      }),
    ])
  })

  it('retries failed host disposal without losing the handle', () => {
    const calls: Call[] = []
    let shouldFail = true
    const base = createAdapter(calls)
    const adapter = {
      ...base,
      dispose(handle: unknown) {
        calls.push({ type: 'dispose', handle })
        if (shouldFail) {
          shouldFail = false
          throw new Error('host dispose failed')
        }
      },
    }
    const host = createRendererHost(adapter)

    host.render([entry('a', 'cell-a', 'A')])
    expect(() => host.dispose()).toThrow(
      expect.objectContaining({
        message:
          '[ZEUS_RENDERER_ADAPTER_FAILURE] Renderer dispose failed for key a.',
        cause: expect.objectContaining({ message: 'host dispose failed' }),
      }),
    )
    expect(() => host.dispose()).not.toThrow()
    expect(calls.filter(call => call.type === 'dispose')).toHaveLength(2)
    expect(() => host.render([])).toThrow(
      '[ZEUS_RENDERER_DISPOSED] The renderer host has already been disposed.',
    )
  })
})

describe('renderer sessions', () => {
  it('gives every mount a new generation and aborts it before disposal', () => {
    const sessions: RendererSession[] = []
    const events: string[] = []
    const host = createRendererHost<string, string, undefined, number>({
      mount(_container, _data, _context, session) {
        sessions.push(session)
        session.signal.addEventListener('abort', () =>
          events.push(`abort ${String(session.key)}#${session.generation}`),
        )
        return session.generation
      },
      update() {},
      dispose(handle) {
        events.push(`dispose #${handle}`)
      },
    })
    const entries = (...keys: string[]) =>
      keys.map(key => ({ key, container: key, data: key, context: undefined }))

    host.render(entries('a', 'b'))
    host.render(entries('a'))
    host.render(entries('a', 'b'))
    host.dispose()

    expect(sessions.map(session => [session.key, session.generation])).toEqual([
      ['a', 1],
      ['b', 2],
      ['b', 3],
    ])
    expect(sessions.every(session => session.signal.aborted)).toBe(true)
    expect(events).toEqual([
      'abort b#2',
      'dispose #2',
      'abort a#1',
      'dispose #1',
      'abort b#3',
      'dispose #3',
    ])
  })

  it('aborts the session of a mount that throws', () => {
    let session: RendererSession | undefined
    const host = createRendererHost<string, string>({
      mount(_container, _data, _context, current) {
        session = current
        throw new Error('render exploded')
      },
      update() {},
      dispose() {},
    })

    expect(() =>
      host.render([
        { key: 'a', container: 'a', data: 'a', context: undefined },
      ]),
    ).toThrow(
      expect.objectContaining({
        message:
          '[ZEUS_RENDERER_ADAPTER_FAILURE] Renderer mount failed for key a.',
        cause: expect.objectContaining({ message: 'render exploded' }),
      }),
    )
    expect(session?.signal.aborted).toBe(true)
  })
})
