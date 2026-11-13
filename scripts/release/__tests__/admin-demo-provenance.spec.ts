import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

/**
 * The Admin recording script is the only place the published demo's provenance
 * is written, so its argument handling is a release contract rather than a
 * convenience.
 *
 * Each run below starts the real Admin server — the same code the demo replays
 * — so the assertion is about the metadata a published demo would ship, not
 * about a mock. A run that produced no recording must fail instead of writing
 * `"unknown"`, which is what the workflow used to allow.
 */
const run = promisify(execFile)
const root = path.resolve(import.meta.dirname, '../../..')
const script = path.join(root, 'scripts/release/admin-demo-snapshot.ts')
const roots: string[] = []

afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

const CORE_SHA = 'a'.repeat(40)
const UI_SHA = 'b'.repeat(40)

function scratch(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'zeus-admin-recording-'))
  roots.push(directory)
  return directory
}

function invoke(args: readonly string[]): Promise<{ stdout: string }> {
  return run(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, NODE_OPTIONS: '--experimental-sqlite' },
  })
}

/** Runs the script expecting failure, and returns what it said. */
async function failure(args: readonly string[]): Promise<string> {
  try {
    await invoke(args)
  } catch (error) {
    const failed = error as { stderr?: string; message?: string }
    return `${failed.stderr ?? ''}${failed.message ?? ''}`
  }
  throw new Error(`expected the recording to fail with ${args.join(' ')}`)
}

describe('admin demo snapshot provenance', () => {
  it('requires both commits and rejects a malformed SHA', async () => {
    const out = path.join(scratch(), 'snapshot.json')

    expect(await failure(['--out', out, '--core-commit', CORE_SHA])).toMatch(
      '--ui-commit is required',
    )
    expect(
      await failure([
        '--out',
        out,
        '--core-commit',
        CORE_SHA,
        '--ui-commit',
        UI_SHA.slice(0, 12),
      ]),
    ).toMatch('--ui-commit must be a full 40-character lowercase SHA')
    expect(
      await failure([
        '--out',
        out,
        '--core-commit',
        CORE_SHA.toUpperCase(),
        '--ui-commit',
        UI_SHA,
      ]),
    ).toMatch('--core-commit must be a full 40-character lowercase SHA')
    expect(
      await failure([
        '--out',
        out,
        '--core-commit',
        CORE_SHA,
        '--ui-commit',
        'unknown',
      ]),
    ).toMatch('--ui-commit must be a full 40-character lowercase SHA')
  })

  it('records both commits in the snapshot it writes', async () => {
    const out = path.join(scratch(), 'snapshot.json')
    await invoke([
      '--out',
      out,
      '--core-commit',
      CORE_SHA,
      '--ui-commit',
      UI_SHA,
    ])

    const snapshot = JSON.parse(readFileSync(out, 'utf8')) as Record<
      string,
      unknown
    >
    expect(snapshot.schema).toBe('zeus.admin-demo/v1')
    expect(snapshot.coreCommit).toBe(CORE_SHA)
    expect(snapshot.uiCommit).toBe(UI_SHA)
    expect(Array.isArray(snapshot.users)).toBe(true)
    expect((snapshot.users as unknown[]).length).toBeGreaterThan(0)
  })

  it('names the same pair and the same data every time it runs', async () => {
    // Reproducibility of the *pairing*: two recordings of the same pair name
    // the same commits and carry the same seed rows. The audit timestamps come
    // from real requests, so they are normalized out — asserting on them would
    // be asserting on wall-clock time, not on provenance.
    const first = path.join(scratch(), 'first.json')
    const second = path.join(scratch(), 'second.json')
    const args = ['--core-commit', CORE_SHA, '--ui-commit', UI_SHA]
    await invoke(['--out', first, ...args])
    await invoke(['--out', second, ...args])

    const stable = (file: string): unknown => {
      const value = JSON.parse(readFileSync(file, 'utf8')) as {
        generatedAt?: string
        audit?: Array<{ created_at?: string; [key: string]: unknown }>
        [key: string]: unknown
      }
      value.generatedAt = '<timestamp>'
      value.audit = (value.audit ?? []).map(entry => ({
        ...entry,
        created_at: '<timestamp>',
      }))
      return value
    }
    expect(stable(second)).toEqual(stable(first))
  })
})
