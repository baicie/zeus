/**
 * Runs a browser check across every requested engine.
 *
 * The R20 checks each launched `chromium` directly and reported one result.
 * That was accurate about what they ran and misleading about what they proved:
 * a Firefox-only defect in DOM adoption or slot assignment could not be seen by
 * any of them, and "DOM_RUNTIME_E2E_VERIFIED" quietly meant "in Chromium".
 *
 * This module is the one place the loop lives, so the four checks cannot drift
 * apart in how they select, report or classify engines:
 *
 *   * engines come from `requestedEngines`, which `ZEUS_BROWSERS` and each
 *     check's own variable both feed;
 *   * an engine that cannot launch is `blocked`, never `passed` and never a
 *     silent skip — a missing Firefox is a statement about the machine, and the
 *     report has to say so rather than claim three-engine coverage;
 *   * every result carries the engine's real version;
 *   * a failure keeps the screenshot and the trace under an engine-specific
 *     name, so "it failed in WebKit" is a directory, not a sentence.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium, firefox, webkit } from '@playwright/test'

import { engineTargets, isMissingBrowser } from './browser-channel'

import type { BrowserType } from '@playwright/test'

export interface EngineCheckResult {
  readonly check: string
  readonly status: 'passed' | 'failed'
  readonly error?: string
}

export interface EngineOutcome {
  readonly engine: string
  readonly version: string | null
  readonly status: 'passed' | 'failed' | 'blocked'
  readonly checks: EngineCheckResult[]
  readonly error?: string
}

export interface RunAcrossEnginesOptions {
  /** Directory for screenshots and traces; created on first failure. */
  readonly outputDir: string
  /**
   * Wall-clock budget for one engine, in milliseconds.
   *
   * Without it, an engine whose page never finishes loading consumes the job's
   * entire timeout and the log says nothing about which check was in flight.
   * That is what happened on the first CI run of these checks: `browser-runtime`
   * sat in `DOM precise updates` for twenty minutes with no output, and the
   * checks after it never reported at all.
   *
   * Defaults to five minutes, which is several times what the slowest check
   * needs on any engine.
   */
  readonly engineTimeoutMs?: number
  /** One engine's worth of checks. `page` is a fresh page per engine. */
  readonly run: (
    page: import('@playwright/test').Page,
  ) => Promise<EngineCheckResult[]>
  /** A per-check override, for a check with its own browser variable. */
  readonly engines?: string
  /**
   * Replaces the launchers this run uses. Tests inject a launcher that fails a
   * specific way; production callers never pass it.
   *
   * Added because the BLOCKED path could not be tested honestly. The one test
   * that covered it asked for `firefox` and relied on Playwright's Firefox not
   * being installed — true on a developer machine, false in the Canary job,
   * which installs all three engines. There it launched Firefox, the check
   * passed, and the assertion `exit code === 2` failed with 0. A test whose
   * subject is "what happens when the browser is missing" must be able to make
   * the browser missing.
   */
  readonly launchers?: LaunchTargets
}

/**
 * The three Playwright launchers, by engine.
 *
 * Same shape as the imported `chromium`/`firefox`/`webkit`, so the default is
 * the real ones and a test substitute only has to implement `launch`.
 */
export interface LaunchTargets {
  readonly chromium: BrowserType
  readonly firefox: BrowserType
  readonly webkit: BrowserType
}

/**
 * Runs `run` once per engine and returns one outcome per engine.
 *
 * Never throws for a browser failure: the caller decides what to do with the
 * outcomes, and in practice that is "exit 2 if anything is blocked, 1 if
 * anything failed".
 */
export async function runAcrossEngines(
  options: RunAcrossEnginesOptions,
): Promise<EngineOutcome[]> {
  const targets = engineTargets(
    options.launchers ?? { chromium, firefox, webkit },
    options.engines,
  )
  const budget = options.engineTimeoutMs ?? 5 * 60_000
  const outcomes: EngineOutcome[] = []

  for (const target of targets) {
    /** Resources this engine acquired, released in one place below. */
    let browser: import('@playwright/test').Browser | undefined
    let context: import('@playwright/test').BrowserContext | undefined
    let checks: EngineCheckResult[] = []
    /**
     * Whether this engine's trace is worth keeping.
     *
     * Set here rather than read back from `outcomes`: a blocked engine pushes
     * an outcome of its own and `continue`s, so "the last outcome" is not
     * reliably this engine's.
     */
    let keepTrace = false

    try {
      try {
        browser = await target.launcher.launch(target.options)
      } catch (error) {
        if (isMissingBrowser(error)) {
          outcomes.push({
            engine: target.name,
            version: null,
            status: 'blocked',
            checks: [],
            error: error instanceof Error ? error.message : String(error),
          })
          continue
        }
        throw error
      }

      const version = browser.version()
      if (typeof version !== 'string' || version.length === 0) {
        throw new Error('the browser reported no version')
      }

      context = await browser.newContext()
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      })
      const page = await context.newPage()
      // The page gets a default navigation and action timeout too, so an
      // engine whose requests never resolve fails the check it is in rather
      // than the whole engine.
      page.setDefaultTimeout(Math.min(budget, 60_000))
      page.setDefaultNavigationTimeout(Math.min(budget, 60_000))

      // The race does not cancel `options.run`. What makes that safe is the
      // `finally` below: it closes the context, so the orphaned run's next
      // Playwright call fails with "Target page, context or browser has been
      // closed" instead of touching the next engine's page. Verified by a
      // fixture whose checks resolve after the budget — it reports that
      // failure rather than succeeding late.
      //
      // Cancelling properly would need `options.run` to accept a signal and
      // every check to honour it, which is a larger change than the risk
      // warrants: the engines run one at a time, so the orphan cannot overlap
      // the next one.
      checks = await Promise.race([
        options.run(page),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `the checks did not finish within ${Math.round(budget / 1000)}s ` +
                    `on ${target.name}`,
                ),
              ),
            budget,
          )
          timer.unref?.()
        }),
      ])

      const failed = checks.some(check => check.status === 'failed')
      keepTrace = failed
      outcomes.push({
        engine: target.name,
        version,
        status: failed ? 'failed' : 'passed',
        checks,
      })
    } catch (error) {
      // A thrown check or a blown budget: the trace is exactly what is needed
      // to see where it stopped.
      keepTrace = true
      outcomes.push({
        engine: target.name,
        version: browser?.version() ?? null,
        status: 'failed',
        checks,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      // One place, always reached. The earlier version stopped tracing and
      // closed the context on the success path only, so a check that threw —
      // or an engine that hit its budget — left both behind: no trace to read
      // and a browser that only the process exit reclaimed.
      //
      // Each step is guarded separately, and a failure to release is attached
      // to the outcome instead of thrown: cleanup must not replace the error
      // that explains why cleanup was needed.
      const released = await releaseResources(target.name, browser, context, {
        outputDir: options.outputDir,
        keepTrace,
      })
      if (released !== null) {
        const outcome = outcomes[outcomes.length - 1]
        if (outcome && outcome.engine === target.name) {
          outcomes[outcomes.length - 1] = {
            ...outcome,
            error: [outcome.error, `cleanup: ${released}`]
              .filter(Boolean)
              .join('; '),
          }
        }
      }
    }
  }

  return outcomes
}

/**
 * Releases one engine's browser and context, collecting any failures.
 *
 * Each step is independent: a context that refuses to stop tracing must not
 * stop the browser from closing, and neither may throw, because this runs in a
 * `finally` and would replace the error that made it necessary.
 *
 * Returns a description of what failed, or `null` when everything released.
 */
async function releaseResources(
  engine: string,
  browser: import('@playwright/test').Browser | undefined,
  context: import('@playwright/test').BrowserContext | undefined,
  options: { outputDir: string; keepTrace: boolean },
): Promise<string | null> {
  const problems: string[] = []

  if (context) {
    // Tracing is stopped before the context closes: closing with tracing still
    // running discards the trace, and a trace is the only artefact that says
    // what the page looked like when a check failed.
    try {
      if (options.keepTrace) {
        await fs.mkdir(options.outputDir, { recursive: true })
        await context.tracing.stop({
          path: path.join(options.outputDir, `trace-${engine}.zip`),
        })
      } else {
        await context.tracing.stop()
      }
    } catch (error) {
      problems.push(
        `tracing.stop: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    try {
      await context.close()
    } catch (error) {
      problems.push(
        `context.close: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (browser) {
    try {
      await browser.close()
    } catch (error) {
      problems.push(
        `browser.close: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return problems.length > 0 ? problems.join(', ') : null
}

/**
 * Prints the per-engine table and sets the process exit code.
 *
 * Split from the run so a check can add its own summaries before deciding.
 * Exit codes: 2 when any engine could not start (BLOCKED), 1 when any check
 * failed, 0 only when every requested engine passed.
 */
/**
 * The exit code a set of outcomes implies.
 *
 * BLOCKED wins over failed: if an engine never started, the run cannot say
 * whether the checks would have passed, and reporting 1 would claim it knows.
 *
 * Extracted from `reportAcrossEngines` so the rule can be asserted without
 * setting `process.exitCode` in the test process — which vitest reads as its
 * own exit code and would turn a passing suite red.
 */
export function exitCodeFor(outcomes: readonly EngineOutcome[]): 0 | 1 | 2 {
  if (outcomes.some(outcome => outcome.status === 'blocked')) return 2
  if (outcomes.some(outcome => outcome.status === 'failed')) return 1
  return 0
}

export function reportAcrossEngines(
  outcomes: readonly EngineOutcome[],
  label: string,
): void {
  for (const outcome of outcomes) {
    const heading =
      outcome.version === null
        ? `${outcome.engine}: ${outcome.status.toUpperCase()}`
        : `${outcome.engine} ${outcome.version}: ${outcome.status.toUpperCase()}`
    console.log(`\n${heading}`)
    if (outcome.error) console.log(`  ${outcome.error.split('\n')[0]}`)
    for (const check of outcome.checks) {
      const mark = check.status === 'passed' ? 'ok  ' : 'FAIL'
      console.log(`  ${mark} ${check.check}`)
      if (check.error) {
        for (const line of check.error.split('\n')) {
          console.log(`       ${line}`)
        }
      }
    }
  }

  const blocked = outcomes.filter(outcome => outcome.status === 'blocked')
  const failed = outcomes.filter(outcome => outcome.status === 'failed')
  const passed = outcomes.filter(outcome => outcome.status === 'passed')

  console.log(
    `\n${label}: ${passed.length}/${outcomes.length} engine(s) passed` +
      (failed.length > 0 ? `, ${failed.length} failed` : '') +
      (blocked.length > 0 ? `, ${blocked.length} blocked` : ''),
  )

  if (blocked.length > 0) {
    console.error(
      `BLOCKED: ${blocked.length} engine(s) could not start. Those checks did ` +
        `not run and must not be reported as passing:\n` +
        blocked
          .map(outcome => `  - ${outcome.engine}: ${outcome.error}`)
          .join('\n'),
    )
  }
  // One assignment from the extracted rule, so the code and the printed
  // summary cannot disagree.
  const code = exitCodeFor(outcomes)
  if (code !== 0) process.exitCode = code
}
