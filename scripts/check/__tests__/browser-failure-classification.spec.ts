/**
 * How the browser runner classifies a failure it cannot recover from (TASK 04 / R23).
 *
 * There are two outcomes a check runner must never confuse:
 *
 *   * the environment cannot provide a browser — BLOCKED, nothing was tested;
 *   * the browser started and something went wrong — FAILED, something was.
 *
 * Getting that backwards is expensive in both directions. Excusing a real defect
 * as BLOCKED hides it; calling a missing browser FAILED sends someone hunting
 * for a bug in code that never ran.
 *
 * The boundary is `isMissingBrowser`, a regex over Playwright's message. These
 * tests drive it in-process, with no browser and no subprocess, so they run in
 * milliseconds and cannot depend on what is installed — which is exactly what
 * the subprocess test that failed in the Canary job got wrong.
 *
 * ## Why the list is long
 *
 * Each entry is a real message. The negative ones matter more than the positive
 * ones: it is easy to widen `isMissingBrowser` until every launch error is
 * BLOCKED, and nothing would notice until a genuine crash was excused.
 */
import { describe, expect, it } from 'vitest'

import { isMissingBrowser } from '../browser-channel'
import { exitCodeFor } from '../browser-engines'

import type { EngineOutcome } from '../browser-engines'

describe('isMissingBrowser', () => {
  it.each([
    [
      'the pinned build was never downloaded',
      "browserType.launch: Executable doesn't exist at /Users/x/Library/Caches/ms-playwright/firefox-1555/firefox/Nightly.app/Contents/MacOS/firefox",
    ],
    [
      'Playwright cannot find a channel binary',
      'browserType.launch: Browser was not found at the configured executablePath',
    ],
    [
      'the browser is not at the path the channel names',
      'Executable is not found at /opt/google/chrome/chrome',
    ],
    [
      "Playwright's own install hint",
      'Looks like Playwright was just installed or updated. Please run the following command to download new browsers: npx playwright install',
    ],
  ])('treats %s as a missing browser', (_label, message) => {
    expect(isMissingBrowser(new Error(message))).toBe(true)
  })

  it.each([
    [
      'the browser crashed on startup',
      'Target page, context or browser has been closed',
    ],
    ['the process was killed', 'Browser closed unexpectedly: SIGKILL'],
    [
      'the protocol connection dropped',
      'Protocol error (Browser.getVersion): Target closed',
    ],
    ['a permission error', 'EACCES: permission denied, open /usr/bin/chromium'],
    [
      'an out-of-disk sandbox failure',
      'Failed to launch the browser process: ENOSPC',
    ],
    ['an assertion in the check itself', 'expected 2 to be 3'],
    ['a page timeout', 'page.waitForFunction: Timeout 60000ms exceeded'],
  ])('does not treat %s as a missing browser', (_label, message) => {
    // Every one of these means a browser was there and something else went
    // wrong. Calling them BLOCKED would excuse a real failure.
    expect(isMissingBrowser(new Error(message))).toBe(false)
  })

  it('does not treat an empty or unrelated error as a missing browser', () => {
    expect(isMissingBrowser(new Error(''))).toBe(false)
    expect(isMissingBrowser(new Error('something entirely unrelated'))).toBe(
      false,
    )
    // A non-Error reaching here must not throw: the value comes from a rejected
    // launch, whose rejection reason is `unknown`.
    expect(isMissingBrowser('a string reason')).toBe(false)
    expect(isMissingBrowser(undefined)).toBe(false)
  })
})

/** Minimal outcome, so the tests below read as the case they describe. */
function outcome(
  status: 'passed' | 'failed' | 'blocked',
  engine = 'chromium',
): EngineOutcome {
  return {
    engine: engine as EngineOutcome['engine'],
    version: status === 'blocked' ? null : '1.0',
    status,
    checks: [],
    error: status === 'blocked' ? "Executable doesn't exist" : undefined,
  }
}

describe('exitCodeFor', () => {
  it('is 0 only when every engine passed', () => {
    expect(exitCodeFor([outcome('passed'), outcome('passed', 'firefox')])).toBe(
      0,
    )
  })

  it('is 1 when a check failed and every engine started', () => {
    expect(exitCodeFor([outcome('passed'), outcome('failed', 'firefox')])).toBe(
      1,
    )
  })

  it('is 2 when any engine was blocked', () => {
    expect(exitCodeFor([outcome('blocked')])).toBe(2)
  })

  it('lets blocked win over failed', () => {
    // A blocked engine means part of the run never happened, so the score is
    // not "1 failure out of 2" — it is "we do not know". Reporting 1 would
    // claim knowledge the run does not have.
    expect(exitCodeFor([outcome('failed'), outcome('blocked', 'webkit')])).toBe(
      2,
    )
  })

  it('is 0 for an empty list, which callers must not reach', () => {
    // Documented behaviour rather than a desirable one: a run that produced no
    // outcomes is a bug in the caller. Asserting it here makes the behaviour
    // visible instead of accidental.
    expect(exitCodeFor([])).toBe(0)
  })
})
