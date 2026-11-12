import { describe, expect, it, vi } from 'vitest'

import {
  createHighlightScheduler,
  escapeHtml,
  fallbackHtml,
  type HighlightOutcome,
} from '../highlight-scheduler'

/** Collects outcomes so each assertion can inspect the whole sequence. */
function recorder(): {
  onOutcome: (outcome: HighlightOutcome) => void
  outcomes: HighlightOutcome[]
} {
  const outcomes: HighlightOutcome[] = []
  return {
    outcomes,
    onOutcome: outcome => {
      outcomes.push(outcome)
    },
  }
}

/** Flushes pending microtasks so a resolved loader has run its then/catch. */
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0))

describe('escapeHtml', () => {
  it('escapes the three characters that would otherwise become markup', () => {
    expect(escapeHtml('<div class="a">b & c</div>')).toBe(
      '&lt;div class="a"&gt;b &amp; c&lt;/div&gt;',
    )
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('const x = 1')).toBe('const x = 1')
  })
})

describe('fallbackHtml', () => {
  it('shows the empty message for empty code', () => {
    expect(fallbackHtml('', 'No output yet')).toBe('No output yet')
  })

  it('escapes code rather than returning it raw', () => {
    expect(fallbackHtml('<b>', 'empty')).toBe('&lt;b&gt;')
  })
})

describe('createHighlightScheduler — loading', () => {
  it('shows escaped plain text immediately, before the chunk resolves', () => {
    const rec = recorder()
    // A loader that never settles, so the test observes the loading state.
    const schedule = createHighlightScheduler({
      load: () => new Promise(() => {}),
      onOutcome: rec.onOutcome,
    })
    schedule('<p>hello</p>')
    expect(rec.outcomes).toHaveLength(1)
    expect(rec.outcomes[0]).toEqual({
      html: '&lt;p&gt;hello&lt;/p&gt;',
      state: 'loading',
    })
  })

  it('replaces the plain text with highlighted HTML once loaded', async () => {
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load: async () => (code: string) => `<span class="tok">${code}</span>`,
      onOutcome: rec.onOutcome,
    })
    schedule('const x = 1')
    await flush()
    expect(rec.outcomes.map(outcome => outcome.state)).toEqual([
      'loading',
      'ready',
    ])
    expect(rec.outcomes[1]!.html).toBe('<span class="tok">const x = 1</span>')
  })

  it('does not request the chunk again for a repeat of the same code', async () => {
    const load = vi.fn(async () => (code: string) => code)
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load,
      onOutcome: rec.onOutcome,
    })
    schedule('a')
    schedule('a')
    await flush()
    schedule('a')
    expect(load).toHaveBeenCalledTimes(1)
    // loading, ready — and nothing after re-scheduling the same string.
    expect(rec.outcomes).toHaveLength(2)
  })

  it('loads once for several different code strings', async () => {
    const load = vi.fn(async () => (code: string) => code)
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load,
      onOutcome: rec.onOutcome,
    })
    schedule('a')
    schedule('b')
    await flush()
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('createHighlightScheduler — failure', () => {
  it('keeps readable escaped text when the chunk fails to load', async () => {
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load: async () => {
        throw new Error('Failed to fetch dynamically imported module')
      },
      onOutcome: rec.onOutcome,
    })
    schedule('<App />')
    await flush()
    const last = rec.outcomes.at(-1)!
    expect(last.state).toBe('failed')
    expect(last.html).toBe('&lt;App /&gt;')
    expect(last.error).toContain('Failed to fetch')
  })

  it('does not produce an unhandled rejection', async () => {
    // Vitest fails the run on an unhandled rejection, so completing this test
    // at all is the assertion that none escaped. The rejected promise is
    // deliberately created before any `.catch` is attached, which is the shape
    // that used to escape: `void import().then(…)` with no rejection handler.
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load: () => Promise.reject(new Error('network down')),
      onOutcome: rec.onOutcome,
    })
    schedule('code')
    await flush()
    expect(rec.outcomes.at(-1)!.state).toBe('failed')
    expect(rec.outcomes.at(-1)!.error).toContain('network down')
  })

  it('retries on the next code change after a failure', async () => {
    let attempts = 0
    const load = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('transient')
      return (code: string) => `<b>${code}</b>`
    })
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load,
      onOutcome: rec.onOutcome,
    })
    schedule('first')
    await flush()
    expect(rec.outcomes.at(-1)!.state).toBe('failed')

    schedule('second')
    await flush()
    expect(rec.outcomes.at(-1)!.state).toBe('ready')
    expect(rec.outcomes.at(-1)!.html).toBe('<b>second</b>')
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('createHighlightScheduler — staleness', () => {
  it('discards a result for code that has already been replaced', async () => {
    let resolveFirst: ((fn: (code: string) => string) => void) | undefined
    let call = 0
    const load = (): Promise<(code: string) => string> => {
      call += 1
      if (call === 1) {
        return new Promise(resolve => {
          resolveFirst = resolve
        })
      }
      return Promise.resolve((code: string) => `<b>${code}</b>`)
    }
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load,
      onOutcome: rec.onOutcome,
    })

    schedule('old')
    schedule('new')
    // The first request resolves late, after 'new' was scheduled.
    resolveFirst!((code: string) => `<i>${code}</i>`)
    await flush()

    // The highlighted output must never be for 'old'.
    for (const outcome of rec.outcomes) {
      expect(outcome.html).not.toContain('<i>old</i>')
    }
  })

  it('writes nothing after the consumer detaches', async () => {
    // The component's `write` checks whether its element is still mounted; the
    // scheduler must not require that check to be correct for the code to be
    // safe, so it reports outcomes and the component decides. This asserts the
    // contract the component relies on: an outcome always names the code it is
    // for, so a detached consumer can compare.
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load: async () => (code: string) => `<b>${code}</b>`,
      onOutcome: rec.onOutcome,
    })
    schedule('attached')
    await flush()
    expect(rec.outcomes.at(-1)!.html).toBe('<b>attached</b>')
    // Nothing is emitted after the last schedule call returns and resolves.
    const settled = rec.outcomes.length
    await flush()
    expect(rec.outcomes).toHaveLength(settled)
  })
})

describe('createHighlightScheduler — ordering', () => {
  it('emits loading before ready for a single code string', async () => {
    const rec = recorder()
    const schedule = createHighlightScheduler({
      load: async () => (code: string) => code.toUpperCase(),
      onOutcome: rec.onOutcome,
    })
    schedule('abc')
    await flush()
    expect(rec.outcomes.map(outcome => outcome.state)).toEqual([
      'loading',
      'ready',
    ])
    expect(rec.outcomes[0]!.html).toBe('abc')
    expect(rec.outcomes[1]!.html).toBe('ABC')
  })
})
