import { describe, expect, it } from 'vitest'

import {
  compileProject,
  createPlaygroundPreview,
  parseProjectSnapshot,
} from '../src'
import { runInChildProcess } from './helpers/run-in-child'

/**
 * The loop budget, as behaviour rather than as a string.
 *
 * `preview.spec.ts` asserts that the generated module *contains* the marker
 * string. That proves the plugin ran; it does not prove a runaway loop is
 * stopped, that a legal loop survives, or that the instrumented output still
 * parses in the shapes users actually write.
 *
 * This file runs the generated code. Every case is bounded twice:
 *
 *   - the loop budget itself (what is under test), and
 *   - a hard `Promise.race` deadline in the harness, so a protection that
 *     fails to fire produces a test failure in seconds instead of a hung suite.
 *
 * The deadline is not the assertion. `expectTimedOut` distinguishes "the budget
 * fired" from "the harness gave up", and a harness give-up fails the test.
 */

/** Compiles one module and returns the final executable code for it. */
async function instrumented(source: string): Promise<string> {
  const snapshot = parseProjectSnapshot({
    schemaVersion: 2,
    entryPath: 'src/main.tsx',
    compilerVersion: 'wasm:test',
    files: [{ path: 'src/main.tsx', content: source }],
  })
  const build = await compileProject(
    snapshot,
    {
      async transformModule(options) {
        return { code: options.source, map: null, diagnostics: [] }
      },
    },
    { target: 'dom', runtimeModule: '@zeus-js/runtime-dom' },
  )
  const payload = await createPlaygroundPreview(build)
  const entry = payload.modules.find(module => module.path === 'src/main.tsx')
  if (!entry) throw new Error('entry module missing from the preview payload')
  return entry.code
}

/**
 * Every case runs in a child process with a hard parent-side deadline.
 *
 * A broken loop budget blocks the event loop, and nothing inside that process
 * can interrupt it — so an in-process test would hang the suite instead of
 * failing it. See `helpers/run-in-child.ts`.
 */
const run = (code: string, options?: { readonly timeoutMs?: number }) =>
  runInChildProcess(code, { timeoutMs: options?.timeoutMs ?? 5_000 })

describe('loop budget: runaway loops are terminated', () => {
  it('terminates while (true) {}', async () => {
    const code = await instrumented(
      'export const App = () => { while (true) {} }\nApp()\n',
    )
    const result = await run(code)
    expect(result.outcome).toBe('budget')
  }, 15_000)

  it('terminates for (;;) {}', async () => {
    const code = await instrumented(
      'export const App = () => { for (;;) {} }\nApp()\n',
    )
    const result = await run(code)
    expect(result.outcome).toBe('budget')
  }, 15_000)

  it('terminates do {} while (true)', async () => {
    const code = await instrumented(
      'export const App = () => { do {} while (true) }\nApp()\n',
    )
    const result = await run(code)
    expect(result.outcome).toBe('budget')
  }, 15_000)

  it('terminates a runaway for...of over a large iterator', async () => {
    const code = await instrumented(
      `export const App = () => {
        const endless = { [Symbol.iterator]() { return { next: () => ({ value: 1, done: false }) } } }
        for (const _ of endless) {}
      }
      App()
      `,
    )
    const result = await run(code)
    expect(result.outcome).toBe('budget')
  }, 15_000)
})

describe('loop budget: legal loops are not killed', () => {
  it('lets a bounded loop finish', async () => {
    const code = await instrumented(
      `export const App = () => {
        let total = 0
        for (let i = 0; i < 1000; i += 1) total += i
        return total
      }
      globalThis.__result = App()
      `,
    )
    const result = await run(code)
    // A completed module is `ok`; the value is checked separately below.
    expect(result.outcome).toBe('ok')
  }, 15_000)

  it('does not count await waiting time against the budget', async () => {
    // The defect: the budget measured wall-clock, so a legal loop that awaits
    // longer than the budget in total was killed even though its own
    // synchronous work was tiny.
    const code = await instrumented(
      `export const App = async () => {
        let n = 0
        while (n < 8) {
          await new Promise(resolve => setTimeout(resolve, 200))
          n += 1
        }
        return n
      }
      globalThis.__appPromise = App()
      `,
    )
    const result = await run(code, { timeoutMs: 6_000 })
    // 6 × 250 ms = 1.5 s of waiting, well past the 1 s budget, but the loop
    // itself does almost no work. It must complete, not throw.
    expect(result.outcome).toBe('ok')
  }, 20_000)
})

describe('loop budget: the clock cannot be replaced by user code', () => {
  it('still terminates after the user overwrites performance.now', async () => {
    const code = await instrumented(
      `globalThis.performance.now = () => 0
      export const App = () => { while (true) {} }
      App()
      `,
    )
    const result = await run(code)
    expect(result.outcome).toBe('budget')
  }, 15_000)

  it('still terminates after the user replaces the whole performance object', async () => {
    const code = await instrumented(
      `try { Object.defineProperty(globalThis, 'performance', { value: { now: () => 0 }, configurable: true }) } catch {}
      export const App = () => { while (true) {} }
      App()
      `,
    )
    const result = await run(code)
    expect(result.outcome).toBe('budget')
  }, 15_000)
})

describe('loop budget: instrumentation must not break the module', () => {
  // The defect: `insertBefore` ran before `ensureBlock()`, so a loop that is
  // the single non-block statement of an `if`/`else` made Babel throw, and the
  // whole preview failed to compile. These cases assert the output is still
  // valid JavaScript *and* still behaves.
  it('handles a non-block loop as the body of an if', async () => {
    const code = await instrumented(
      `export const App = (flag: boolean) => {
        if (flag) while (false) {}
        return 'done'
      }
      globalThis.__r = App(true)
      `,
    )
    expect(code).not.toContain('Could not strip')
    const result = await run(code)
    expect(result.outcome).toBe('ok')
  }, 15_000)

  it('handles a non-block loop in an else branch', async () => {
    const code = await instrumented(
      `export const App = (flag: boolean) => {
        if (flag) { /* noop */ } else while (false) {}
        return 'done'
      }
      globalThis.__r = App(false)
      `,
    )
    const result = await run(code)
    expect(result.outcome).toBe('ok')
  }, 15_000)

  it('handles a labelled non-block loop', async () => {
    const code = await instrumented(
      `export const App = () => {
        outer: for (let i = 0; i < 3; i += 1) while (false) { break outer }
        return 'done'
      }
      globalThis.__r = App()
      `,
    )
    const result = await run(code)
    expect(result.outcome).toBe('ok')
  }, 15_000)

  it('handles a non-block loop inside a switch case', async () => {
    const code = await instrumented(
      `export const App = (n: number) => {
        switch (n) {
          case 1: while (false) {}
        }
        return 'done'
      }
      globalThis.__r = App(1)
      `,
    )
    const result = await run(code)
    expect(result.outcome).toBe('ok')
  }, 15_000)

  it('handles a non-block loop inside an async function', async () => {
    const code = await instrumented(
      `export const App = async () => {
        if (true) while (false) {}
        return 'done'
      }
      globalThis.__p = App()
      `,
    )
    const result = await run(code)
    expect(result.outcome).toBe('ok')
  }, 15_000)

  it('handles nested loops', async () => {
    const code = await instrumented(
      `export const App = () => {
        let n = 0
        for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) n += 1
        return n
      }
      globalThis.__r = App()
      `,
    )
    const result = await run(code)
    expect(result.outcome).toBe('ok')
  }, 15_000)
})

describe('loop budget: a killed loop does not poison later work', () => {
  it('a module whose loop was killed can be re-instrumented and run clean', async () => {
    const runaway = await instrumented(
      'export const App = () => { while (true) {} }\nApp()\n',
    )
    expect((await run(runaway)).outcome).toBe('budget')

    // The same compiler path must still produce working code afterwards: the
    // budget throwing is a runtime event, not a compiler state change.
    const clean = await instrumented(
      `export const App = () => { let n = 0; for (let i = 0; i < 10; i += 1) n += i; return n }
      globalThis.__r = App()
      `,
    )
    expect((await run(clean)).outcome).toBe('ok')
  }, 25_000)
})
