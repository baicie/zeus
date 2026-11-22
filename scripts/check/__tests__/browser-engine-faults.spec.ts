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

  it('exits 2 when the browser cannot start, and does not claim a pass', async () => {
    const result = await drive('pass', 'firefox')
    expect(result.code).toBe(2)
    expect(result.stdout).toContain('BLOCKED')
    expect(result.stdout).not.toContain('passed on every engine')
  }, 120_000)
})
