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
      const context = await browser.newContext()
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      })
      const page = await context.newPage()
      const checks = await options.run(page)

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
