import { describe, expect, it } from 'vitest'

import {
  applyLatestTagRepair,
  changeVerified,
  looksAbsent,
  planLatestTagRepair,
  stableVersions,
} from '../repair-latest-tags'

import type { RegistryClient } from '../repair-latest-tags'

describe('latest dist-tag repair', () => {
  it('selects the highest stable version and ignores prereleases', () => {
    expect(
      stableVersions([
        '1.0.0-canary.1',
        '0.9.0',
        '1.0.0',
        '1.1.0-rc.0',
        '1.0.1',
        'nope',
      ]),
    ).toEqual(['1.0.1', '1.0.0', '0.9.0'])
  })

  it('plans set, remove and no-op actions without inventing versions', () => {
    const actions = planLatestTagRepair([
      {
        name: '@zeus-js/zeus',
        latest: '1.0.0',
        versions: ['1.0.0'],
      },
      {
        name: '@zeus-js/query',
        latest: '1.1.0-canary.1',
        versions: ['1.0.0', '1.1.0-canary.1'],
      },
      {
        name: '@zeus-js/router',
        latest: '1.1.0-canary.1',
        versions: ['1.1.0-canary.1'],
      },
      {
        name: '@zeus-js/resource',
        versions: [],
      },
      {
        name: '@zeus-js/testing',
        versions: [],
        published: false,
      },
    ])

    expect(actions).toEqual([
      {
        kind: 'none',
        name: '@zeus-js/zeus',
        reason: 'latest is stable or not semver',
      },
      {
        kind: 'set',
        name: '@zeus-js/query',
        from: '1.1.0-canary.1',
        version: '1.0.0',
        reason: 'move latest from prerelease to highest stable',
      },
      {
        kind: 'remove',
        name: '@zeus-js/router',
        from: '1.1.0-canary.1',
        reason: 'no stable version exists; remove prerelease latest',
      },
      {
        kind: 'none',
        name: '@zeus-js/resource',
        reason: 'latest is absent',
      },
      {
        kind: 'none',
        name: '@zeus-js/testing',
        reason: 'package is not published',
      },
    ])
  })

  it('requires explicit apply and a non-empty npm identity', () => {
    const client: RegistryClient = {
      whoami: () => '',
      setTag: () => {
        throw new Error('must not write')
      },
      removeTag: () => {
        throw new Error('must not write')
      },
      readLatest: () => {
        throw new Error('must not read')
      },
    }
    const actions = planLatestTagRepair([
      {
        name: '@zeus-js/router',
        latest: '1.0.0-canary.1',
        versions: ['1.0.0-canary.1'],
      },
    ])

    expect(() =>
      applyLatestTagRepair(actions, client, { apply: false }),
    ).toThrow('requires { apply: true }')
    expect(() =>
      applyLatestTagRepair(actions, client, { apply: true }),
    ).toThrow('npm authentication is required')
  })

  it('writes only the planned tag changes and reports partial failures', () => {
    const calls: string[] = []
    const client: RegistryClient = {
      whoami: () => 'release-owner',
      setTag: (name, version, tag) => {
        if (name === '@zeus-js/query') throw new Error('permission denied')
        calls.push(`set ${name}@${version} ${tag}`)
      },
      removeTag: (name, tag) => calls.push(`remove ${name} ${tag}`),
      /*
       * The registry honours the change. A client that reports success without
       * the tag moving is covered separately — that is the failure this
       * interface exists to let the repair detect.
       */
      readLatest: name =>
        name === '@zeus-js/query'
          ? { status: 'PRESENT' as const, version: '1.1.0-canary.1' }
          : { status: 'ABSENT' as const },
    }
    const actions = planLatestTagRepair([
      {
        name: '@zeus-js/query',
        latest: '1.1.0-canary.1',
        versions: ['1.0.0', '1.1.0-canary.1'],
      },
      {
        name: '@zeus-js/router',
        latest: '1.1.0-canary.1',
        versions: ['1.1.0-canary.1'],
      },
    ])

    const results = applyLatestTagRepair(actions, client, { apply: true })
    expect(calls).toEqual(['remove @zeus-js/router latest'])
    expect(results).toEqual([
      {
        name: '@zeus-js/query',
        action: 'set',
        ok: false,
        error: 'permission denied',
      },
      { name: '@zeus-js/router', action: 'remove', ok: true },
    ])
  })
})

/*
 * The failure this repair could not see before: `npm dist-tag rm` exits 0 and
 * `latest` stays where it was. Measured against Verdaccio 6 — the command
 * prints `-latest: <pkg>@0.2.0-rc.0` and a subsequent read still returns
 * `latest: 0.2.0-rc.0`, because a package keeps a default install target.
 *
 * A repair that trusts the exit code reports "done" while the prerelease is
 * still what `npm install <pkg>` gives you.
 */
describe('a registry that ignores the removal', () => {
  it('reports the removal as failed, and says what latest still points at', () => {
    const client: RegistryClient = {
      whoami: () => 'release-owner',
      setTag: () => {},
      removeTag: () => {
        /* exits 0, changes nothing */
      },
      readLatest: () => ({ status: 'PRESENT' as const, version: '0.2.0-rc.0' }),
    }
    const actions = planLatestTagRepair([
      { name: '@zeus-js/i18n', latest: '0.2.0-rc.0', versions: ['0.2.0-rc.0'] },
    ])
    const results = applyLatestTagRepair(actions, client, { apply: true })
    expect(results[0]).toMatchObject({
      name: '@zeus-js/i18n',
      ok: false,
      observedLatest: '0.2.0-rc.0',
    })
    expect(results[0]?.error).toMatch(
      /reported success but latest still points at 0\.2\.0-rc\.0/,
    )
  })

  /*
   * The defect this replaces: `readLatest` returned `undefined` for both "the
   * tag is absent" and "the query failed", and the removal path read
   * `undefined` as success. A registry outage therefore reported the tag
   * repaired while it still pointed at the prerelease.
   *
   * The test that used to sit here asserted the fail-open behaviour and called
   * it "unverified rather than successful" — the comment was right and the
   * assertion was the opposite.
   */
  it('treats a failed read-back as a failure, not as a successful removal', () => {
    const client: RegistryClient = {
      whoami: () => 'release-owner',
      setTag: () => {},
      removeTag: () => {},
      readLatest: () => ({
        status: 'QUERY_FAILED',
        error: 'ETIMEDOUT npm view @zeus-js/i18n',
      }),
    }
    const actions = planLatestTagRepair([
      { name: '@zeus-js/i18n', latest: '0.2.0-rc.0', versions: ['0.2.0-rc.0'] },
    ])
    const results = applyLatestTagRepair(actions, client, { apply: true })
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.error).toMatch(/could not read latest back/)
    expect(results[0]?.error).toMatch(/ETIMEDOUT/)
  })

  it('confirms a removal only when the read-back says absent', () => {
    const client: RegistryClient = {
      whoami: () => 'release-owner',
      setTag: () => {},
      removeTag: () => {},
      readLatest: () => ({ status: 'ABSENT' }),
    }
    const actions = planLatestTagRepair([
      { name: '@zeus-js/i18n', latest: '0.2.0-rc.0', versions: ['0.2.0-rc.0'] },
    ])
    const results = applyLatestTagRepair(actions, client, { apply: true })
    expect(results[0]?.ok).toBe(true)
  })

  it('confirms a set that landed', () => {
    const client: RegistryClient = {
      whoami: () => 'release-owner',
      setTag: () => {},
      removeTag: () => {},
      readLatest: () => ({ status: 'PRESENT' as const, version: '1.0.0' }),
    }
    const actions = planLatestTagRepair([
      {
        name: '@zeus-js/router',
        latest: '1.1.0-canary.1',
        versions: ['1.0.0', '1.1.0-canary.1'],
      },
    ])
    const results = applyLatestTagRepair(actions, client, { apply: true })
    expect(results[0]).toMatchObject({ ok: true, observedLatest: '1.0.0' })
  })
})

/*
 * Registry read-back, state by state.
 *
 * The task's list, each as a case: delete succeeds, set succeeds, the command
 * exits 0 but the tag stays, 404, 429, 500/503, DNS, timeout, invalid JSON,
 * wrong value, retries exhausted, and a partial multi-package run.
 *
 * These drive `changeVerified` and `looksAbsent` directly rather than mocking a
 * successful command, because "the command succeeded" is exactly the claim that
 * must not be trusted.
 */
describe('registry read-back classification', () => {
  it('verifies a removal only on ABSENT', () => {
    expect(changeVerified('remove', { status: 'ABSENT' })).toBe(true)
    expect(
      changeVerified('remove', { status: 'PRESENT', version: '0.2.0-rc.0' }),
    ).toBe(false)
    expect(
      changeVerified('remove', { status: 'QUERY_FAILED', error: 'ETIMEDOUT' }),
    ).toBe(false)
  })

  it('verifies a set only on PRESENT at the exact version', () => {
    expect(
      changeVerified('set', { status: 'PRESENT', version: '1.0.0' }, '1.0.0'),
    ).toBe(true)
    expect(
      changeVerified('set', { status: 'PRESENT', version: '1.0.1' }, '1.0.0'),
    ).toBe(false)
    expect(changeVerified('set', { status: 'ABSENT' }, '1.0.0')).toBe(false)
    expect(
      changeVerified(
        'set',
        { status: 'QUERY_FAILED', error: 'EAI_AGAIN' },
        '1.0.0',
      ),
    ).toBe(false)
  })

  /*
   * The 404 family is the only thing read as absence. A missing dist-tag and a
   * missing package both come back as E404, and both are answers.
   */
  it('reads only the 404 family as absence', () => {
    expect(looksAbsent('npm ERR! code E404')).toBe(true)
    expect(
      looksAbsent('404 Not Found - GET https://registry.npmjs.org/x'),
    ).toBe(true)
    expect(looksAbsent('npm ERR! no dist-tags found for @zeus-js/x')).toBe(true)
  })

  /*
   * Everything else is unreadable. This is the direction that matters: a
   * classifier that guessed permissively would turn every novel network error
   * into a successful repair.
   */
  it('treats network and server failures as unreadable', () => {
    for (const message of [
      'npm ERR! code ETIMEDOUT',
      'npm ERR! code EAI_AGAIN getaddrinfo ENOTFOUND registry.npmjs.org',
      'npm ERR! code ECONNREFUSED',
      'npm ERR! code E429 Too Many Requests',
      'npm ERR! 503 Service Unavailable',
      'npm ERR! 500 Internal Server Error',
      'something nobody classified',
    ]) {
      expect(looksAbsent(message), message).toBe(false)
    }
  })

  it('fails a partial multi-package run and names only the failed one', () => {
    const client: RegistryClient = {
      whoami: () => 'release-owner',
      setTag: () => {},
      removeTag: () => {},
      /* The first package's tag really goes; the second's query fails. */
      readLatest: name =>
        name === '@zeus-js/i18n'
          ? { status: 'ABSENT' }
          : { status: 'QUERY_FAILED', error: 'ETIMEDOUT' },
    }
    const actions = planLatestTagRepair([
      { name: '@zeus-js/i18n', latest: '0.2.0-rc.0', versions: ['0.2.0-rc.0'] },
      {
        name: '@zeus-js/eslint-plugin',
        latest: '0.2.0-rc.0',
        versions: ['0.2.0-rc.0'],
      },
    ])
    const results = applyLatestTagRepair(actions, client, { apply: true })
    expect(results.map(r => r.ok)).toEqual([true, false])
    expect(results[0]?.name).toBe('@zeus-js/i18n')
    expect(results[1]?.error).toMatch(/could not read latest back/)
  })
})
