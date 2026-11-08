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
