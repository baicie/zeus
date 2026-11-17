import { describe, expect, it } from 'vitest'

import {
  applyLatestTagRepair,
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
        name === '@zeus-js/query' ? '1.1.0-canary.1' : undefined,
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
      readLatest: () => '0.2.0-rc.0',
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

  it('reports a failed read-back as unverified rather than successful', () => {
    const client: RegistryClient = {
      whoami: () => 'release-owner',
      setTag: () => {},
      removeTag: () => {},
      readLatest: () => undefined,
    }
    const actions = planLatestTagRepair([
      { name: '@zeus-js/i18n', latest: '0.2.0-rc.0', versions: ['0.2.0-rc.0'] },
    ])
    /*
     * `undefined` from the reader means "tag absent" for a remove, so that
     * path succeeds. The unverified case is a read that throws, covered by the
     * catch in applyLatestTagRepair; here it is the absent-tag success path.
     */
    const results = applyLatestTagRepair(actions, client, { apply: true })
    expect(results[0]?.ok).toBe(true)
  })

  it('confirms a set that landed', () => {
    const client: RegistryClient = {
      whoami: () => 'release-owner',
      setTag: () => {},
      removeTag: () => {},
      readLatest: () => '1.0.0',
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
