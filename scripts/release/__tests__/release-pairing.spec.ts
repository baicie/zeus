/**
 * Pairing records: the one thing standing between a Core tag and a UI commit
 * nobody chose.
 *
 * The record is read by name, at a path derived from the version, from the
 * tagged commit. Every rule here exists because getting it wrong means a
 * release pairs with the wrong UI — silently, since the packages would still
 * build.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  RELEASE_PAIRING_SCHEMA,
  validatePairingDirectory,
  validatePairingRecord,
} from '../release-pairing'

const SHA = 'a'.repeat(40)

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function record(overrides: Record<string, unknown> = {}): unknown {
  return {
    schema: RELEASE_PAIRING_SCHEMA,
    coreVersion: '0.2.0-rc.0',
    uiCommit: SHA,
    uiVersion: '0.2.0-rc.0',
    verifiedAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  }
}

function problemsFor(
  value: unknown,
  file = 'release-pairing/v0.2.0-rc.0.json',
): string[] {
  return validatePairingRecord(value, file).map(problem => problem.message)
}

describe('a valid record', () => {
  it('passes', () => {
    expect(problemsFor(record())).toEqual([])
  })

  it('accepts a stable version', () => {
    expect(
      problemsFor(
        record({ coreVersion: '0.2.0', uiVersion: '0.2.0' }),
        'release-pairing/v0.2.0.json',
      ),
    ).toEqual([])
  })
})

describe('refusals', () => {
  it('rejects a non-object', () => {
    expect(problemsFor(null)).toContain('not a JSON object')
  })

  it('rejects the wrong schema', () => {
    expect(
      problemsFor(record({ schema: 'zeus.release-pairing/v2' })),
    ).toContainEqual(expect.stringContaining('schema must be'))
  })

  /*
   * A branch name is not a release identity — it moves. This is the rule that
   * makes the record worth having.
   */
  it('rejects a branch name as the UI commit', () => {
    expect(problemsFor(record({ uiCommit: 'main' }))).toContainEqual(
      expect.stringContaining('full 40-character SHA'),
    )
  })

  it('rejects a short SHA', () => {
    expect(problemsFor(record({ uiCommit: 'abc1234' }))).toContainEqual(
      expect.stringContaining('full 40-character SHA'),
    )
  })

  it('rejects a UI version that differs from the Core version', () => {
    expect(problemsFor(record({ uiVersion: '0.1.0-beta.35' }))).toContainEqual(
      expect.stringContaining('must be one version'),
    )
  })

  /*
   * The workflow looks the file up by version. A record whose own
   * `coreVersion` disagrees with its name is one that gets read for a release
   * it does not describe.
   */
  it('rejects a file name that does not match the version inside it', () => {
    expect(problemsFor(record(), 'release-pairing/v0.3.0.json')).toContainEqual(
      expect.stringContaining('file name must be'),
    )
  })

  it('rejects an unparseable version', () => {
    expect(problemsFor(record({ coreVersion: 'next' }))).toContainEqual(
      expect.stringContaining('coreVersion must be a version'),
    )
  })

  it('rejects an unmapped prerelease channel', () => {
    expect(
      problemsFor(
        record({ coreVersion: '0.2.0-canary.1', uiVersion: '0.2.0-canary.1' }),
        'release-pairing/v0.2.0-canary.1.json',
      ),
    ).toContainEqual(expect.stringContaining('coreVersion must be a version'))
  })

  it('rejects a non-UTC timestamp', () => {
    expect(
      problemsFor(record({ verifiedAt: '2026-11-16 00:00:00' })),
    ).toContainEqual(expect.stringContaining('ISO-8601 UTC'))
  })
})

describe('a directory of records', () => {
  function directory(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-pairing-'))
    roots.push(root)
    return root
  }

  it('accepts an empty directory with only a README', () => {
    const root = directory()
    fs.writeFileSync(path.join(root, 'README.md'), '# pairing\n')
    expect(validatePairingDirectory(root)).toEqual([])
  })

  it('reports a missing directory', () => {
    expect(validatePairingDirectory('/nonexistent-pairing-dir')).toHaveLength(1)
  })

  it('reports invalid JSON', () => {
    const root = directory()
    fs.writeFileSync(path.join(root, 'v0.2.0.json'), '{not json')
    expect(
      validatePairingDirectory(root).map(problem => problem.message),
    ).toContain('not valid JSON')
  })

  /*
   * A stray file in a directory the release reads from is how the wrong record
   * gets found.
   */
  it('reports a non-JSON file', () => {
    const root = directory()
    fs.writeFileSync(path.join(root, 'notes.txt'), 'hello')
    expect(
      validatePairingDirectory(root).map(problem => problem.message),
    ).toContain('only .json pairing records belong here')
  })

  it('validates each record against its own name', () => {
    const root = directory()
    fs.writeFileSync(
      path.join(root, 'v0.2.0.json'),
      JSON.stringify(record({ coreVersion: '0.2.0', uiVersion: '0.2.0' })),
    )
    expect(validatePairingDirectory(root)).toEqual([])
  })
})

describe('the real directory', () => {
  it('passes', () => {
    const root = path.resolve(import.meta.dirname, '../../..')
    expect(
      validatePairingDirectory(path.join(root, 'release-pairing')),
    ).toEqual([])
  })
})
