/**
 * The release-group audit must not confuse four different states (R23 TASK 15/16).
 *
 * A package can be **unpublished** (the registry answered 404), **unanswerable**
 * (network, auth, 5xx), **published with a polluted `latest`**, or **published
 * but part of the framework a consumer needs**. Collapsing the first two is how
 * a rate-limited `npm view` becomes "25 packages are missing"; collapsing the
 * last into the first is how rc.3's real state — seven published, none of them
 * the runtime — read as "7 of 32, so partly there".
 *
 * Both confusions happened while this script was being written, and both are
 * pinned here with an injected runner: no registry, no network.
 */
import { describe, expect, it } from 'vitest'

import {
  auditGroup,
  frameworkCheckpoint,
  inspectPackage,
  FRAMEWORK_PACKAGES,
} from '../audit-release-group'

import type { NpmCommandResult, NpmRunner } from '../npm-registry'

const noSleep = async () => {}
const options = { attempts: 1, sleep: noSleep }

/** A runner that answers from a table: `needle` -> stdout, or an error status. */
function runnerFor(
  table: Record<string, { stdout?: string; status?: number; stderr?: string }>,
): NpmRunner {
  return (args): NpmCommandResult => {
    const text = args.join(' ')
    for (const [needle, answer] of Object.entries(table)) {
      if (text.includes(needle)) {
        return {
          status: answer.status ?? 0,
          stdout: answer.stdout ?? '',
          stderr: answer.stderr ?? '',
        }
      }
    }
    return { status: 1, stdout: '', stderr: 'npm error code E404' }
  }
}

describe('inspectPackage', () => {
  it('reports a published version with its tarball, integrity and tags', async () => {
    const state = await inspectPackage('@zeus-js/x', '1.0.0', 'r', {
      ...options,
      runner: runnerFor({
        '@zeus-js/x@1.0.0': {
          stdout: JSON.stringify({
            version: '1.0.0',
            dist: {
              integrity: 'sha512-a',
              tarball: 'https://registry.example/@zeus-js/x/-/x-1.0.0.tgz',
              unpackedSize: 1234,
            },
          }),
        },
        'dist-tags': {
          stdout: JSON.stringify({
            latest: '1.0.0',
            rc: '1.0.0',
            beta: '0.9.0',
          }),
        },
      }),
    })
    expect(state).toMatchObject({
      published: true,
      latest: '1.0.0',
      tags: ['latest', 'rc'],
      integrity: 'sha512-a',
      tarball: 'https://registry.example/@zeus-js/x/-/x-1.0.0.tgz',
      unpackedSize: 1234,
      query: { outcome: 'ok' },
    })
    expect(state.queriedAt, 'every row must be dated').toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    )
  })

  it('separates a 404 from a registry that could not be asked', async () => {
    const missing = await inspectPackage('@zeus-js/y', '1.0.0', 'r', {
      ...options,
      runner: runnerFor({
        '@zeus-js/y@1.0.0': { status: 1, stderr: 'npm error code E404' },
      }),
    })
    expect(missing.published).toBe(false)
    expect(missing.query?.outcome).toBe('not-found')
    expect(missing.queriedAt, 'a 404 is still an answer, and is dated').toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    )

    const unreachable = await inspectPackage('@zeus-js/z', '1.0.0', 'r', {
      ...options,
      runner: runnerFor({
        '@zeus-js/z@1.0.0': {
          status: 1,
          stderr: 'ETIMEDOUT registry unreachable',
        },
      }),
    })
    expect(unreachable.published).toBe(false)
    expect(
      unreachable.query?.outcome,
      'a network failure must not read as "not published"',
    ).toBe('failed')
    expect(unreachable.error).toContain('ETIMEDOUT')
  })

  it('keeps the published answer when only dist-tags fails', async () => {
    const state = await inspectPackage('@zeus-js/w', '1.0.0', 'r', {
      ...options,
      runner: runnerFor({
        '@zeus-js/w@1.0.0': { stdout: JSON.stringify({ version: '1.0.0' }) },
        'dist-tags': { status: 1, stderr: 'ETIMEDOUT' },
      }),
    })
    expect(state.published).toBe(true)
    expect(state.tags).toBeUndefined()
    // Not an empty array: "no tags point here" and "tags unknown" differ.
    expect(state.tagsError).toContain('ETIMEDOUT')
  })
})

describe('auditGroup', () => {
  it('names the two first-publish latest bindings as pollution', async () => {
    // The rc.3 shape: some packages carry the version on `rc`, and the two
    // whose first real publish this was carry it on `latest` too.
    const group = ['@zeus-js/compiler', '@zeus-js/eslint-plugin']
    const report = await auditGroup('0.2.0-rc.3', 'r', group, {
      ...options,
      runner: runnerFor({
        '@zeus-js/compiler@0.2.0-rc.3': {
          stdout: JSON.stringify({ version: '0.2.0-rc.3' }),
        },
        '@zeus-js/eslint-plugin@0.2.0-rc.3': {
          stdout: JSON.stringify({ version: '0.2.0-rc.3' }),
        },
        // The first matching needle wins, so the per-package tag entries come
        // before the generic one.
        'view @zeus-js/compiler dist-tags': {
          stdout: JSON.stringify({ latest: '0.1.0', rc: '0.2.0-rc.3' }),
        },
        'view @zeus-js/eslint-plugin dist-tags': {
          stdout: JSON.stringify({ latest: '0.2.0-rc.3', rc: '0.2.0-rc.3' }),
        },
      }),
    })
    expect(report.published).toBe(2)
    expect(report.latestBoundTo).toEqual(['@zeus-js/eslint-plugin'])
  })

  it('is not partial when every package was answered for', async () => {
    const report = await auditGroup(
      '1.0.0',
      'r',
      ['@zeus-js/a', '@zeus-js/b'],
      {
        ...options,
        runner: runnerFor({}),
      },
    )
    // Both queries 404 in the default table -> both unpublished, nothing
    // partial, nothing unanswered.
    expect(report).toMatchObject({
      published: 0,
      missing: 2,
      partial: false,
      failed: 0,
    })
  })

  it('is inconclusive, not partial, when a package could not be asked', async () => {
    // The distinction the exit code depends on: a partial publish is a
    // decision, an unanswered audit is not actionable at all.
    const report = await auditGroup(
      '1.0.0',
      'r',
      ['@zeus-js/a', '@zeus-js/b'],
      {
        ...options,
        runner: runnerFor({
          '@zeus-js/a@1.0.0': { stdout: JSON.stringify({ version: '1.0.0' }) },
          '@zeus-js/b@1.0.0': { status: 1, stderr: 'ETIMEDOUT' },
        }),
      },
    )
    expect(report.failed).toBe(1)
    expect(
      report.partial,
      'one published and one unanswered is not "partial"',
    ).toBe(false)
  })
})

describe('framework checkpoint', () => {
  it('is incomplete when any required runtime package is missing', () => {
    // The rc.3 shape exactly: the compiler packages landed, the runtime did
    // not. Seven of thirty-two published, and nothing a consumer can build.
    const packages = [
      { name: '@zeus-js/compiler', published: true },
      { name: '@zeus-js/compiler-native', published: true },
      ...FRAMEWORK_PACKAGES.filter(name => name !== '@zeus-js/zeus').map(
        name => ({ name, published: true }),
      ),
      { name: '@zeus-js/zeus', published: false },
    ]
    const checkpoint = frameworkCheckpoint(packages)
    expect(checkpoint.complete).toBe(false)
    expect(checkpoint.missing).toEqual(['@zeus-js/zeus'])
    expect(checkpoint.verdict).toContain('NOT usable')
    expect(checkpoint.verdict).toContain('@zeus-js/zeus')
  })

  it('is complete only when all five are published', () => {
    const checkpoint = frameworkCheckpoint(
      FRAMEWORK_PACKAGES.map(name => ({ name, published: true })),
    )
    expect(checkpoint.complete).toBe(true)
    expect(checkpoint.missing).toEqual([])
    expect(checkpoint.verdict).toContain('complete')
  })

  it('never reports complete for an empty audit', () => {
    // A run that queried nothing must not pass the checkpoint by vacuity —
    // the failure mode a `every()` over an empty list would produce.
    const checkpoint = frameworkCheckpoint([])
    expect(checkpoint.complete).toBe(false)
    expect(checkpoint.present).toEqual([])
    expect(checkpoint.missing.length).toBe(FRAMEWORK_PACKAGES.length)
  })
})
