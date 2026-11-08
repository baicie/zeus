import { describe, expect, it } from 'vitest'

import {
  classifyLatestTag,
  evaluateLatestTags,
  readLatestTag,
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
