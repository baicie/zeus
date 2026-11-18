import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  classifyLatestTag,
  evaluateLatestPolicy,
  evaluateLatestTags,
  readApprovedFirstPublish,
  readLatestTag,
  verdictBlocksRelease,
  type LatestTagRecord,
} from '../check-latest-tags'
import { isRcVersion, resolveReleaseVersion } from '../release-version'

import type { NpmRunner } from '../npm-registry'

const noSleep = async () => {}

describe('RC latest dist-tag policy', () => {
  it('rejects a latest tag that points at a prerelease', () => {
    expect(
      evaluateLatestTags([
        { name: '@zeus-js/zeus', state: classifyLatestTag('0.1.0') },
        { name: '@zeus-js/query', state: classifyLatestTag('0.1.1-beta.20') },
        { name: '@zeus-js/shared', state: classifyLatestTag(undefined) },
      ]).errors,
    ).toEqual([
      '@zeus-js/query: latest points at prerelease 0.1.1-beta.20; run pnpm repair:latest-tags',
    ])
  })

  it('accepts stable and absent latest tags', () => {
    expect(
      evaluateLatestTags([
        { name: '@zeus-js/zeus', state: classifyLatestTag('0.1.0') },
        { name: '@zeus-js/shared', state: classifyLatestTag(null) },
      ]).errors,
    ).toEqual([])
  })

  it('classifies every latest state explicitly', () => {
    expect(classifyLatestTag('0.1.0').status).toBe('LATEST_STABLE')
    expect(classifyLatestTag('0.1.1-beta.20').status).toBe('LATEST_PRERELEASE')
    expect(classifyLatestTag(undefined).status).toBe('LATEST_ABSENT')
    expect(classifyLatestTag(null).status).toBe('LATEST_ABSENT')
    expect(classifyLatestTag('').status).toBe('LATEST_ABSENT')
    expect(
      classifyLatestTag({ version: '0.1.0' } as unknown as string).status,
    ).toBe('REGISTRY_QUERY_FAILED')
  })
})

describe('registry failure handling', () => {
  const runner = (
    results: Array<{ status: number; stdout?: string; stderr?: string }>,
  ): NpmRunner => {
    let index = 0
    return () => {
      const result = results[Math.min(index, results.length - 1)]!
      index += 1
      return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      }
    }
  }

  it('reports an explicit 404 as LATEST_ABSENT', async () => {
    const state = await readLatestTag('@zeus-js/unpublished', {
      runner: runner([{ status: 1, stderr: 'npm error code E404' }]),
      sleep: noSleep,
    })
    expect(state.status).toBe('LATEST_ABSENT')
  })

  it('reports an empty response as LATEST_ABSENT', async () => {
    const state = await readLatestTag('@zeus-js/zeus', {
      runner: runner([{ status: 0, stdout: '' }]),
      sleep: noSleep,
    })
    expect(state.status).toBe('LATEST_ABSENT')
  })

  it('retries transient failures and then fails closed', async () => {
    let calls = 0
    const state = await readLatestTag('@zeus-js/zeus', {
      attempts: 3,
      sleep: noSleep,
      runner: () => {
        calls += 1
        return { status: 1, stdout: '', stderr: 'ETIMEDOUT' }
      },
    })
    expect(calls).toBe(3)
    expect(state.status).toBe('REGISTRY_QUERY_FAILED')
  })

  it('recovers when a retry succeeds', async () => {
    let calls = 0
    const state = await readLatestTag('@zeus-js/zeus', {
      attempts: 3,
      sleep: noSleep,
      runner: () => {
        calls += 1
        if (calls === 1) {
          return { status: 1, stdout: '', stderr: 'EAI_AGAIN' }
        }
        return { status: 0, stdout: '"0.1.0"', stderr: '' }
      },
    })
    expect(state).toEqual({ status: 'LATEST_STABLE', version: '0.1.0' })
  })

  it.each([
    ['registry 500', 'npm error code E500'],
    ['registry 503', '503 Service Unavailable'],
    ['authentication', 'npm error code E401'],
    ['dns', 'getaddrinfo ENOTFOUND registry.npmjs.org'],
    ['invalid json', 'not-json'],
  ])('fails closed on %s', async (_label, output) => {
    const state = await readLatestTag('@zeus-js/zeus', {
      attempts: 2,
      sleep: noSleep,
      runner: () =>
        output === 'not-json'
          ? { status: 0, stdout: output, stderr: '' }
          : { status: 1, stdout: '', stderr: output },
    })
    expect(state.status).toBe('REGISTRY_QUERY_FAILED')
  })

  it('blocks the release when any package query fails', () => {
    const evaluation = evaluateLatestTags([
      { name: '@zeus-js/zeus', state: classifyLatestTag('0.1.0') },
      {
        name: '@zeus-js/query',
        state: { status: 'REGISTRY_QUERY_FAILED', error: 'ETIMEDOUT' },
      },
    ])
    expect(evaluation.errors).toEqual([
      '@zeus-js/query: registry query failed: ETIMEDOUT',
    ])
    expect(evaluation.failures).toEqual(['@zeus-js/query'])
  })
})

describe('release version source', () => {
  it('detects RC versions only', () => {
    expect(isRcVersion('0.2.0-rc.0')).toBe(true)
    expect(isRcVersion('0.2.0-rc.12')).toBe(true)
    expect(isRcVersion('0.2.0-canary.20260101')).toBe(false)
    expect(isRcVersion('0.2.0')).toBe(false)
  })

  it('accepts one agreed version across explicit, tag and package sources', () => {
    const resolved = resolveReleaseVersion({
      explicit: '0.2.0-rc.0',
      tag: 'v0.2.0-rc.0',
      zeusPackage: '0.2.0-rc.0',
      rootPackage: '0.1.1-beta.20',
    })
    expect(resolved.version).toBe('0.2.0-rc.0')
    expect(resolved.rc).toBe(true)
    expect(resolved.errors).toEqual([])
    expect(resolved.warnings).toEqual([
      'root package.json version 0.1.1-beta.20 differs from release version 0.2.0-rc.0',
    ])
  })

  it('rejects disagreeing sources', () => {
    const resolved = resolveReleaseVersion({
      explicit: '0.2.0-rc.0',
      tag: 'v0.2.0-rc.1',
      zeusPackage: '0.2.0-rc.0',
    })
    expect(resolved.errors[0]).toContain('release version sources disagree')
  })

  it('rejects a release without any trustworthy version source', () => {
    const resolved = resolveReleaseVersion({
      rootPackage: '0.1.1-beta.20',
    })
    expect(resolved.errors[0]).toContain('no release version source')
  })

  it('does not let the root package version decide whether the gate runs', () => {
    const resolved = resolveReleaseVersion({
      zeusPackage: '0.2.0-rc.0',
      rootPackage: '0.1.1-beta.20',
    })
    expect(resolved.rc).toBe(true)
    expect(resolved.version).toBe('0.2.0-rc.0')
  })
})

/*
 * The post-publish verdict.
 *
 * The problem this exists for: npm binds `latest` to a package's first
 * publication regardless of `--tag`, so three approved first publications make
 * `latest` point at an RC after a release that otherwise succeeded. The
 * workflow's raw error count treated that as a failure, which stopped the Node
 * smoke and the GitHub Release for a state the maintainer had approved in
 * advance — and the tag, already pushed, could not be removed.
 *
 * These cases pin the four verdicts and, more importantly, the two ways the
 * exception could be abused: approving a package whose `latest` points at a
 * different version, and accepting a package nobody approved.
 */
describe('the post-publish latest verdict', () => {
  const VERSION = '0.2.0-rc.0'

  function prerelease(name: string, version = VERSION): LatestTagRecord {
    return { name, state: { status: 'LATEST_PRERELEASE', version } }
  }
  function stable(name: string, version = '0.1.0'): LatestTagRecord {
    return { name, state: { status: 'LATEST_STABLE', version } }
  }
  function absent(name: string): LatestTagRecord {
    return { name, state: { status: 'LATEST_ABSENT' } }
  }
  function failed(name: string): LatestTagRecord {
    return {
      name,
      state: { status: 'REGISTRY_QUERY_FAILED', error: 'ETIMEDOUT' },
    }
  }

  const THREE = [
    '@zeus-js/i18n',
    '@zeus-js/eslint-plugin',
    '@zeus-js/playground-engine',
  ]

  it('passes when every latest is compliant', () => {
    const result = evaluateLatestPolicy({
      records: [stable('@zeus-js/zeus'), absent('@zeus-js/i18n')],
      version: VERSION,
      approvedFirstPublish: THREE,
    })
    expect(result.verdict).toBe('PASS')
    expect(verdictBlocksRelease(result.verdict)).toBe(false)
  })

  it('accepts the three approved first publications', () => {
    const result = evaluateLatestPolicy({
      records: [
        stable('@zeus-js/zeus'),
        ...THREE.map(name => prerelease(name)),
      ],
      version: VERSION,
      approvedFirstPublish: THREE,
    })
    expect(result.verdict).toBe('ACCEPTED_DEVIATION')
    expect([...result.acceptedDeviation].sort()).toEqual([...THREE].sort())
    expect(result.refused).toEqual([])
    /*
     * The whole point: the release continues. The packages were published
     * correctly; the tag deviation is recorded and repairable.
     */
    expect(verdictBlocksRelease(result.verdict)).toBe(false)
  })

  it('refuses a prerelease latest on a package nobody approved', () => {
    const result = evaluateLatestPolicy({
      records: [
        ...THREE.map(name => prerelease(name)),
        prerelease('@zeus-js/zeus'),
      ],
      version: VERSION,
      approvedFirstPublish: THREE,
    })
    expect(result.verdict).toBe('REFUSED')
    expect(result.refused).toEqual(['@zeus-js/zeus'])
    expect(verdictBlocksRelease(result.verdict)).toBe(true)
  })

  /*
   * The narrow half of the exception. Approving a package for first
   * publication says nothing about every later move of its `latest` tag.
   */
  it('refuses an approved package whose latest points at another version', () => {
    const result = evaluateLatestPolicy({
      records: [prerelease('@zeus-js/i18n', '0.2.0-rc.1')],
      version: VERSION,
      approvedFirstPublish: ['@zeus-js/i18n'],
    })
    expect(result.verdict).toBe('REFUSED')
    expect(result.decisions[0]?.basis).toMatch(/not at this release/)
  })

  it('refuses when the pairing record approves nothing', () => {
    const result = evaluateLatestPolicy({
      records: THREE.map(name => prerelease(name)),
      version: VERSION,
      approvedFirstPublish: [],
    })
    expect(result.verdict).toBe('REFUSED')
    expect([...result.refused].sort()).toEqual([...THREE].sort())
  })

  it('reports unknown when any query failed, and blocks', () => {
    const result = evaluateLatestPolicy({
      records: [
        ...THREE.map(name => prerelease(name)),
        failed('@zeus-js/zeus'),
      ],
      version: VERSION,
      approvedFirstPublish: THREE,
    })
    expect(result.verdict).toBe('UNKNOWN')
    expect(result.unknown).toEqual(['@zeus-js/zeus'])
    expect(verdictBlocksRelease(result.verdict)).toBe(true)
  })

  /*
   * Unknown outranks refused: a refused package is a known problem, while an
   * unknown one means part of the picture is missing. Reporting the weaker
   * verdict would understate how much was established.
   */
  it('prefers unknown over refused when both are present', () => {
    const result = evaluateLatestPolicy({
      records: [failed('@zeus-js/zeus'), prerelease('@zeus-js/not-approved')],
      version: VERSION,
      approvedFirstPublish: [],
    })
    expect(result.verdict).toBe('UNKNOWN')
  })

  it('records the basis for every decision', () => {
    const result = evaluateLatestPolicy({
      records: [
        ...THREE.map(name => prerelease(name)),
        stable('@zeus-js/zeus'),
      ],
      version: VERSION,
      approvedFirstPublish: THREE,
    })
    for (const decision of result.decisions) {
      expect(decision.basis.length).toBeGreaterThan(0)
    }
    const accepted = result.decisions.find(d => d.outcome === 'accepted')
    expect(accepted?.firstPublish).toBe(true)
    expect(accepted?.basis).toMatch(/repair:latest-tags/)
  })

  it('does not describe an accepted deviation as compliance', () => {
    const result = evaluateLatestPolicy({
      records: THREE.map(name => prerelease(name)),
      version: VERSION,
      approvedFirstPublish: THREE,
    })
    /*
     * `evaluateLatestTags` still reports these as errors — the tag is wrong.
     * The policy layer is what allows the release to continue, and the two
     * must not be conflated.
     */
    const evaluation = evaluateLatestTags(
      result.decisions.map(d => ({ name: d.name, state: d.state })),
    )
    expect(evaluation.errors.length).toBeGreaterThan(0)
    expect(result.verdict).not.toBe('PASS')
  })
})

/*
 * Where the approval comes from. A flag would be typed at 3am; a committed
 * record was reviewed in a pull request.
 */
describe('reading the approved first publications', () => {
  it('returns [] for a missing record', () => {
    expect(readApprovedFirstPublish(undefined)).toEqual([])
    expect(readApprovedFirstPublish('/nonexistent/path.json')).toEqual([])
  })

  it('returns [] for an unreadable or malformed record', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-latest-'))
    try {
      const bad = path.join(dir, 'bad.json')
      fs.writeFileSync(bad, '{not json')
      expect(readApprovedFirstPublish(bad)).toEqual([])

      const wrongShape = path.join(dir, 'shape.json')
      fs.writeFileSync(wrongShape, JSON.stringify({ firstPublish: 'nope' }))
      expect(readApprovedFirstPublish(wrongShape)).toEqual([])

      const filtered = path.join(dir, 'filtered.json')
      fs.writeFileSync(
        filtered,
        JSON.stringify({ firstPublish: ['@zeus-js/i18n', 42, null] }),
      )
      expect(readApprovedFirstPublish(filtered)).toEqual(['@zeus-js/i18n'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads the approved names from a valid record', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-latest-'))
    try {
      const file = path.join(dir, 'record.json')
      fs.writeFileSync(
        file,
        JSON.stringify({ firstPublish: ['@zeus-js/i18n'] }),
      )
      expect(readApprovedFirstPublish(file)).toEqual(['@zeus-js/i18n'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
