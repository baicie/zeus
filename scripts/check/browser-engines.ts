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
  const targets = engineTargets({ chromium, firefox, webkit }, options.engines)
  const budget = options.engineTimeoutMs ?? 5 * 60_000
  const outcomes: EngineOutcome[] = []

  for (const target of targets) {
    let browser
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
      // A fresh page per engine; the budget applies to the checks, not to the
      // launch (a launch that hangs is caught by the job timeout, and is a
      // different failure).
      if (typeof version !== 'string' || version.length === 0) {
        throw new Error('the browser reported no version')
      }
      const context = await browser.newContext()
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
      const checks = await Promise.race([
        options.run(page),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `the checks did not finish within ${Math.round(budget / 1000)}s ` +
                    `on ${target.name}; the last check to start is the one that hung`,
                ),
              ),
            budget,
          )
          // `unref` so a completed run does not keep the process alive.
          timer.unref?.()
        }),
      ])

      const failed = checks.some(check => check.status === 'failed')
      // The trace is always stopped: `context.close()` with tracing still
      // running discards it, and on a passing run that is the point. Only a
      // failed run writes the file — a trace of a green run is megabytes of
      // nothing, and uploading it every time teaches people to ignore the
      // artifact.
      if (failed) {
        await fs.mkdir(options.outputDir, { recursive: true })
        await context.tracing.stop({
          path: path.join(options.outputDir, `trace-${target.name}.zip`),
        })
      } else {
        await context.tracing.stop()
      }
      await context.close()

      outcomes.push({
        engine: target.name,
        version,
        status: failed ? 'failed' : 'passed',
        checks,
      })
    } catch (error) {
      outcomes.push({
        engine: target.name,
        version: browser?.version() ?? null,
        status: 'failed',
        checks: [],
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await browser?.close()
    }
  }

  return outcomes
}

/**
 * Prints the per-engine table and sets the process exit code.
 *
 * Split from the run so a check can add its own summaries before deciding.
 * Exit codes: 2 when any engine could not start (BLOCKED), 1 when any check
 * failed, 0 only when every requested engine passed.
 */
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
    process.exitCode = 2
  }
  if (failed.length > 0) {
    process.exitCode = 1
  }
}
