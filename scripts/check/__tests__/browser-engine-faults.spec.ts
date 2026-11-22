/**
 * `browser-engines` releases what it acquires, on every path (TASK 21–24 / R22).
 *
 * The runner is the thing every browser check depends on, and its failure paths
 * are the ones nobody exercises by hand: a check that throws, an engine that
 * blows its budget, a browser that will not start. Each of those used to leave
 * the context open or the trace unwritten.
 *
 * These tests drive `scripts/check/fixtures/_engine-fault.ts` as a subprocess
 * and assert on its exit code and on the artefacts it leaves behind, because
 * that is what CI reads.
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const root = path.resolve(import.meta.dirname, '../../..')
const fault = path.join(root, 'scripts/check/fixtures/_engine-fault.ts')
const artefacts = path.join(root, 'temp/engine-fault')

/**
 * Runs the fault harness with one mode and returns what it produced.
 *
 * `ZEUS_BROWSER_CHANNEL=chrome` lets a developer machine without Playwright's
 * pinned build still run this; CI has the pinned build and ignores the channel.
 */
async function drive(
  mode: string,
  engines = 'chromium',
): Promise<{ code: number; stdout: string; files: string[] }> {
  await fs.rm(artefacts, { recursive: true, force: true })
  try {
    const { stdout } = await run('npx', ['tsx', fault, mode], {
      cwd: root,
      env: {
        ...process.env,
        ZEUS_BROWSER_CHANNEL: process.env.ZEUS_BROWSER_CHANNEL ?? 'chrome',
        ZEUS_BROWSERS: engines,
      },
      // The hang and slow modes are bounded by the harness's own budget.
      timeout: 120_000,
    })
    const files = await fs.readdir(artefacts).catch(() => [] as string[])
    return { code: 0, stdout, files }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    const files = await fs.readdir(artefacts).catch(() => [] as string[])
    return {
      code: failure.code ?? -1,
      stdout: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
      files,
    }
  }
}

describe('browser engine runner', () => {
  it('exits 0 and writes no trace when every check passes', async () => {
    const result = await drive('pass')
    expect(result.code).toBe(0)
    expect(result.files).toEqual([])
  }, 120_000)

  it('exits 1 and keeps the trace when a check throws', async () => {
    const result = await drive('throw')
    expect(result.code).toBe(1)
    expect(result.files).toContain('trace-chromium.zip')
  }, 120_000)

  it('exits 1 and keeps the trace when an engine blows its budget', async () => {
    const result = await drive('hang')
    expect(result.code).toBe(1)
    expect(result.files).toContain('trace-chromium.zip')
    expect(result.stdout).toContain('did not finish within')
  }, 120_000)

  it('exits 1 and keeps the trace on an uncaught page error', async () => {
    const result = await drive('pageerror')
    expect(result.code).toBe(1)
    expect(result.files).toContain('trace-chromium.zip')
    expect(result.stdout).toContain('no uncaught page errors')
  }, 120_000)

  it('exits 1 and keeps the trace when navigation never completes', async () => {
    const result = await drive('navigation')
    expect(result.code).toBe(1)
    expect(result.files).toContain('trace-chromium.zip')
  }, 120_000)

  it('fails a run that finishes after its budget instead of passing it', async () => {
    // The orphaned run touches a closed page. Its failure must not be silent
    // and must not be read as a late success.
    const result = await drive('slow')
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('SLOW_RUN_FAILED_AFTER_CLOSE')
  }, 120_000)

  /**
   * The BLOCKED path, made deterministic.
   *
   * This test used to ask for `firefox` and assert exit 2, which assumed
   * Playwright's Firefox was not installed. On a developer machine that held.
   * In the Release Canary job, which installs all three engines, Firefox
   * launched, the run passed, and the assertion failed with "Expected 2,
   * Received 0" — a test about a missing browser that could only pass when the
   * browser was missing.
   *
   * `blocked` mode injects a launcher whose `launch` throws Playwright's own
   * "Executable doesn't exist" message. Nothing about the machine decides the
   * outcome, and the production launch path is untouched: the substitute is a
   * parameter of `runAcrossEngines`, not a branch inside it.
   */
  it('exits 2 when the browser cannot start, and does not claim a pass', async () => {
    const result = await drive('blocked', 'chromium')
    expect(result.code).toBe(2)
    expect(result.stdout).toContain('BLOCKED')
    // A blocked run must never read as a pass, in either phrasing.
    expect(result.stdout).not.toContain('passed on every engine')
    expect(result.stdout).not.toMatch(/^\s*ok\s/m)
  }, 120_000)

  it('blocks every requested engine, not just the first', async () => {
    // A blocked engine `continue`s the loop. If that continue also ended the
    // run, the second and third engines would report nothing at all and the
    // caller would see one BLOCKED line where three were due.
    //
    // This one needs the subprocess even though no browser launches: it is
    // asserting on what a whole run prints and on the process exit code, and
    // `reportAcrossEngines` sets `process.exitCode` — which in the vitest
    // process would be read as the suite's own result.
    const result = await drive('blocked', 'chromium,firefox,webkit')
    expect(result.code).toBe(2)
    const blocked = result.stdout.match(/BLOCKED/g) ?? []
    expect(blocked.length).toBeGreaterThanOrEqual(1)
    for (const engine of ['chromium', 'firefox', 'webkit']) {
      expect(result.stdout).toContain(engine)
    }
  }, 120_000)

  // The crash-versus-blocked distinction is asserted in
  // `browser-failure-classification.spec.ts`, in-process: the classification is
  // `isMissingBrowser`'s decision, and driving a subprocess to ask a question
  // about a regex costs three seconds of tsx startup and one browser probe for
  // nothing. That file covers seven shapes of non-missing failure, not just the
  // one this test used to inject.
})
