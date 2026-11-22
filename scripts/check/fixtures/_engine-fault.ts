/**
 * Fault-injection harness for `browser-engines`, driven by a unit test.
 *
 * Kept out of `scripts/check/*.ts` so the browser-check glob does not pick it
 * up as a check of its own.
 */
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { chromium } from '@playwright/test'

import { reportAcrossEngines, runAcrossEngines } from '../browser-engines'

import type { BrowserType } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../../..')
const output = path.join(root, 'temp/engine-fault')

const server = http.createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(
    '<!doctype html><html><body><div id="app">ok</div></body></html>',
  )
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('no address')
const origin = `http://127.0.0.1:${address.port}`

const mode = process.argv[2] ?? 'throw'

/**
 * A launcher that fails the way a missing browser does.
 *
 * The message is Playwright's own wording for an absent build, which is what
 * `isMissingBrowser` matches on. Reproducing the message rather than the cause
 * is the point: the branch under test is `isMissingBrowser`, and whether this
 * machine happens to have Firefox installed must not decide the result.
 */
function missingBrowser(name: string): BrowserType {
  return {
    ...chromium,
    async launch() {
      throw new Error(
        `browserType.launch: Executable doesn't exist at /nonexistent/${name}/bin`,
      )
    },
  } as unknown as BrowserType
}

/**
 * A launcher that fails for a reason that is NOT a missing browser: a crash on
 * startup. This must reach the caller as a failure, never as BLOCKED.
 */
function crashingBrowser(): BrowserType {
  return {
    ...chromium,
    async launch() {
      throw new Error('Target page, context or browser has been closed')
    },
  } as unknown as BrowserType
}

/**
 * The launchers this run uses, when the mode asks for a substitute.
 *
 * `blocked` and `crash` replace every engine so the outcome does not depend on
 * which browsers are installed — which is what made the original test pass on a
 * laptop and fail in the Canary job.
 */
const substituted =
  mode === 'blocked'
    ? {
        chromium: missingBrowser('chromium'),
        firefox: missingBrowser('firefox'),
        webkit: missingBrowser('webkit'),
      }
    : mode === 'crash'
      ? {
          chromium: crashingBrowser(),
          firefox: crashingBrowser(),
          webkit: crashingBrowser(),
        }
      : undefined

const outcomes = await runAcrossEngines({
  outputDir: output,
  // No `engines` override: `ZEUS_BROWSERS` decides, which is what makes the
  // BLOCKED path reachable in this harness.
  engineTimeoutMs: mode === 'slow' ? 3_000 : 20_000,
  launchers: substituted,
  async run(tab) {
    // Every real check collects page errors and fails on them; this harness
    // does the same, so the `pageerror` mode measures the framework rather than
    // a check that forgot to look.
    const pageErrors: string[] = []
    tab.on('pageerror', error => pageErrors.push(error.message))
    await tab.goto(origin)
    if (mode === 'throw') {
      // A check that throws, the shape a runtime error in the harness takes.
      throw new Error('injected check failure')
    }
    if (mode === 'hang') {
      // A check that never resolves: the engine budget is the only thing that
      // can end this. It records when it eventually runs, so the caller can
      // tell whether a timed-out run kept working on a closed page.
      await new Promise(() => {})
    }
    if (mode === 'pageerror') {
      // An uncaught error in the page: the harness keeps running, so this is
      // the case where a trace is most useful and least likely to be written.
      await tab.evaluate(
        'setTimeout(() => { throw new Error("injected page error") }, 0)',
      )
      await tab.waitForTimeout(100)
      return pageErrors.length === 0
        ? [{ check: 'page error injected', status: 'passed' }]
        : [
            {
              check: 'no uncaught page errors',
              status: 'failed',
              error: pageErrors.join('\n'),
            },
          ]
    }
    if (mode === 'navigation') {
      // A navigation that never completes: the failure is a timeout inside
      // Playwright, not an assertion.
      await tab.goto('http://127.0.0.1:1/', { timeout: 2_000 })
    }
    if (mode === 'slow') {
      // Resolves after the budget: the page is closed by then, so any access
      // here must fail visibly rather than silently succeed.
      await new Promise(resolve => setTimeout(resolve, 30_000))
      try {
        await tab.title()
        console.log('SLOW_RUN_SURVIVED')
      } catch (error) {
        console.log(
          `SLOW_RUN_FAILED_AFTER_CLOSE ${error instanceof Error ? error.message.split('\n')[0] : ''}`,
        )
      }
    }
    return [{ check: 'ok', status: 'passed' }]
  },
})

reportAcrossEngines(outcomes, `fault(${mode})`)
await new Promise<void>(resolve => server.close(() => resolve()))

// Report what survived, so the caller can assert on artefacts rather than on
// log text.
const files = await fs.readdir(output).catch(() => [] as string[])
console.log(`ARTEFACTS ${JSON.stringify(files)}`)
