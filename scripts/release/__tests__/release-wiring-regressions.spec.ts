/**
 * The five defects the merge-gate review found, each reproduced before fixing.
 *
 * Every test here fails against the previous implementation. They are kept as
 * a group because they share a cause worth remembering: the release path was
 * wired together from pieces that each had tests, and nobody tested the
 * wiring. A rule that is correct in isolation can still never fire because its
 * input has the wrong shape.
 */
import { describe, expect, it } from 'vitest'

import { normalizeVersions, readRegistryState } from '../authorize-release'
import { readCurrentTagSha } from '../find-release-evidence'
import { evaluateReleaseAuthorization } from '../release-authorization'
import {
  validatePairingRecord,
  RELEASE_PAIRING_SCHEMA,
} from '../release-pairing'

const CORE = 'a'.repeat(40)
const UI = 'b'.repeat(40)

/*
 * `npm view <pkg> versions --json` returns an array of strings. The first
 * implementation read it as `{ versions: {...} }` and tested membership with
 * `in`, which on an array checks index keys — so every version tested as
 * absent and an already-published version was reported as free.
 */
describe('the registry version list', () => {
  it('reads the array form npm actually returns', () => {
    expect(normalizeVersions(['0.1.0', '0.2.0-rc.0'])).toEqual([
      '0.1.0',
      '0.2.0-rc.0',
    ])
  })

  it('reads a single-version package, which npm returns as a bare string', () => {
    expect(normalizeVersions('0.1.0')).toEqual(['0.1.0'])
  })

  it('reads the document form some proxies return', () => {
    expect(
      normalizeVersions({ versions: { '0.1.0': {}, '0.2.0': {} } }),
    ).toEqual(['0.1.0', '0.2.0'])
  })

  it('reports an unrecognised shape as unknown rather than empty', () => {
    /*
     * `undefined` makes the caller treat registry state as unreadable, which
     * refuses. Returning `[]` would claim the registry has no versions, which
     * is the wrong direction.
     */
    expect(normalizeVersions({ somethingElse: true })).toBeUndefined()
    expect(normalizeVersions(null)).toBeUndefined()
    expect(normalizeVersions(42)).toBeUndefined()
  })

  it('finds a version that is present', () => {
    const published = normalizeVersions(['0.1.1-beta.19', '0.1.1-beta.20'])
    expect(published?.includes('0.1.1-beta.20')).toBe(true)
  })
})

/*
 * The end-to-end version of the same bug: what `readRegistryState` concludes
 * from a registry that already has the version. The first implementation read
 * the array as a document, so this returned no collisions.
 */
describe('reading registry state', () => {
  function query(
    answers: Record<string, unknown>,
  ): Parameters<typeof readRegistryState>[1] {
    const stub = async (args: readonly string[]) => {
      const name = args[1] ?? ''
      const answer = answers[name]
      if (answer === 'not-found') {
        return { status: 'not-found' as const, message: 'missing' }
      }
      if (answer === 'failed') {
        return { status: 'failed' as const, message: 'boom', attempts: 3 }
      }
      /*
       * `readRegistryState` walks every published package. A test that only
       * cares about two of them must not make the other 31 look unreachable,
       * or the whole state reads as unknown and the assertion passes for the
       * wrong reason.
       */
      if (answer === undefined) {
        return { status: 'ok' as const, value: [] }
      }
      return { status: 'ok' as const, value: answer }
    }
    return stub as unknown as Parameters<typeof readRegistryState>[1]
  }

  it('finds a version the registry already has, in the array shape npm returns', async () => {
    const state = await readRegistryState(
      '0.1.1-beta.20',
      query({
        '@zeus-js/zeus': ['0.1.1-beta.19', '0.1.1-beta.20'],
      }),
    )
    expect(state.reachable).toBe(true)
    expect(state.collisions).toContain('@zeus-js/zeus')
  })

  it('reports a never-published package separately', async () => {
    const state = await readRegistryState(
      '0.2.0-rc.0',
      query({
        '@zeus-js/zeus': ['0.1.1-beta.20'],
        '@zeus-js/i18n': 'not-found',
      }),
    )
    expect(state.firstPublish).toContain('@zeus-js/i18n')
    expect(state.collisions).toEqual([])
  })

  it('reports the whole state as unreadable when one query fails', async () => {
    /*
     * Counting a failed query as "no collision" publishes over an existing
     * version; counting it as a collision blocks on a network blip. Neither is
     * a fact, so the state is "unknown" and the policy refuses.
     */
    const state = await readRegistryState(
      '0.2.0-rc.0',
      query({
        '@zeus-js/zeus': ['0.1.1-beta.20'],
        '@zeus-js/signal': 'failed',
      }),
    )
    expect(state.reachable).toBe(false)
  })

  it('does not report a collision for a version that is absent', async () => {
    const state = await readRegistryState(
      '0.2.0-rc.0',
      query({ '@zeus-js/zeus': ['0.1.1-beta.20'] }),
    )
    expect(state.reachable).toBe(true)
    expect(state.collisions).toEqual([])
  })
})

/*
 * An annotated tag's ref points at a tag object. Comparing that SHA against
 * `GITHUB_SHA` — always a commit — reports every annotated tag as "moved
 * during the run", and two of the last three release tags here are annotated.
 */
describe('reading where a tag points', () => {
  function stub(
    answers: Record<string, unknown>,
  ): (args: readonly string[]) => string {
    return args => {
      const key = args[args.length - 1] ?? ''
      const value = answers[key]
      if (value === undefined) throw new Error(`no stub for ${key}`)
      return JSON.stringify(value)
    }
  }

  it('returns the commit for a lightweight tag', () => {
    const sha = readCurrentTagSha(
      'baicie/zeus',
      'v1.0.0',
      stub({
        'repos/baicie/zeus/git/ref/tags/v1.0.0': {
          object: { type: 'commit', sha: CORE },
        },
      }),
    )
    expect(sha).toBe(CORE)
  })

  it('dereferences an annotated tag to its commit', () => {
    const sha = readCurrentTagSha(
      'baicie/zeus',
      'v1.0.0',
      stub({
        'repos/baicie/zeus/git/ref/tags/v1.0.0': {
          object: { type: 'tag', sha: 'c'.repeat(40) },
        },
        [`repos/baicie/zeus/git/tags/${'c'.repeat(40)}`]: {
          object: { type: 'commit', sha: CORE },
        },
      }),
    )
    expect(sha).toBe(CORE)
  })

  it('reports an unreadable tag as undefined rather than guessing', () => {
    expect(
      readCurrentTagSha('baicie/zeus', 'v1.0.0', () => {
        throw new Error('rate limited')
      }),
    ).toBeUndefined()
  })
})

/*
 * npm binds `latest` to a package's first publish regardless of `--tag`. The
 * policy refused such a release, which is right — but it is a decision the
 * maintainer may make, so it can be accepted explicitly, in a committed file,
 * by name.
 */
describe('first publications', () => {
  function input(overrides: Record<string, unknown> = {}) {
    return {
      tagRefName: 'v0.2.0-rc.0',
      workflowSha: CORE,
      checkoutSha: CORE,
      version: '0.2.0-rc.0',
      isMainAncestor: true,
      coreVersions: { '@zeus-js/zeus': '0.2.0-rc.0' },
      uiVersions: { '@zeus-web/button': '0.2.0-rc.0' },
      uiCommit: UI,
      supportingRuns: [
        {
          workflowPath: '.github/workflows/ci.yml',
          runId: '1',
          runAttempt: 1,
          headSha: CORE,
          conclusion: 'success',
          event: 'push',
        },
        {
          workflowPath: '.github/workflows/compiler-native.yml',
          runId: '2',
          runAttempt: 1,
          headSha: CORE,
          conclusion: 'success',
          event: 'workflow_call',
        },
      ],
      requiredWorkflows: [
        '.github/workflows/ci.yml',
        '.github/workflows/compiler-native.yml',
      ],
      sbomOk: true,
      tarballOk: true,
      registryReachable: true,
      registryCollisions: [],
      firstPublishPackages: ['@zeus-js/i18n'],
      distTag: 'rc',
      currentTagSha: CORE,
      ...overrides,
    }
  }

  function distTagFinding(overrides: Record<string, unknown> = {}) {
    return evaluateReleaseAuthorization(
      input(overrides) as Parameters<typeof evaluateReleaseAuthorization>[0],
    ).findings.find(f => f.rule === 'dist-tag')
  }

  it('refuses a first publication by default', () => {
    expect(distTagFinding()?.verdict).toBe('REFUSED')
  })

  it('authorises when the package is named in the acknowledgement', () => {
    expect(
      distTagFinding({ acknowledgedFirstPublish: ['@zeus-js/i18n'] })?.verdict,
    ).toBe('AUTHORIZED')
  })

  it('refuses when the acknowledgement covers a different package', () => {
    /*
     * Exact names, not a wildcard: "accept these three" must not be
     * indistinguishable from "accept whatever shows up next release".
     */
    expect(
      distTagFinding({ acknowledgedFirstPublish: ['@zeus-js/something-else'] })
        ?.verdict,
    ).toBe('REFUSED')
  })

  it('refuses when the acknowledgement covers only some of them', () => {
    expect(
      distTagFinding({
        firstPublishPackages: ['@zeus-js/i18n', '@zeus-js/eslint-plugin'],
        acknowledgedFirstPublish: ['@zeus-js/i18n'],
      })?.verdict,
    ).toBe('REFUSED')
  })
})

describe('the pairing record carries the acknowledgement', () => {
  function record(overrides: Record<string, unknown> = {}): unknown {
    return {
      schema: RELEASE_PAIRING_SCHEMA,
      coreVersion: '0.2.0-rc.0',
      uiCommit: UI,
      uiVersion: '0.2.0-rc.0',
      verifiedAt: '2026-11-16T00:00:00.000Z',
      ...overrides,
    }
  }

  it('accepts a record without the field', () => {
    expect(
      validatePairingRecord(record(), 'meta/release/pairing/v0.2.0-rc.0.json'),
    ).toEqual([])
  })

  it('accepts a list of names', () => {
    expect(
      validatePairingRecord(
        record({ firstPublish: ['@zeus-js/i18n'] }),
        'meta/release/pairing/v0.2.0-rc.0.json',
      ),
    ).toEqual([])
  })

  it('rejects a non-list', () => {
    expect(
      validatePairingRecord(
        record({ firstPublish: '@zeus-js/i18n' }),
        'meta/release/pairing/v0.2.0-rc.0.json',
      ).map(p => p.message),
    ).toContain('firstPublish must be an array of package names')
  })
})
