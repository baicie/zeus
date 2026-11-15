/**
 * The rehearsal has to be able to say no.
 *
 * A dry run that only reports what it would do is a summary, not a check. Each
 * case below is a way a real cut fails, and each must produce a problem rather
 * than a plan.
 */
import { describe, expect, it } from 'vitest'

import { zeusFixedPackages } from '../../release.config'
import { evaluateDryRun, type DryRunInput } from '../rc-dry-run'

const CORE = 'a'.repeat(40)
const UI = 'b'.repeat(40)
const VERSION = '0.2.0-rc.0'

function input(overrides: Partial<DryRunInput> = {}): DryRunInput {
  return {
    mode: 'release-strict',
    coreCommit: CORE,
    uiCommit: UI,
    coreHead: CORE,
    uiHead: UI,
    version: VERSION,
    neverPublished: [],
    unknownRegistryState: [],
    coreVersions: Object.fromEntries(
      zeusFixedPackages.map(name => [name, VERSION]),
    ),
    uiVersions: Object.fromEntries(
      Array.from({ length: 46 }, (_, i) => [`@zeus-web/pkg${i}`, VERSION]),
    ),
    uiRegistryPins: { '@zeus-web/button': VERSION },
    uiCoreConstraints: [{ where: 'zeus-compat dependencies', range: VERSION }],
    ...overrides,
  }
}

describe('a consistent plan', () => {
  it('reports GO', () => {
    const result = evaluateDryRun(input())
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.plan.distTag).toBe('rc')
  })

  it('states the publish order with a dist-tag verification step', () => {
    const result = evaluateDryRun(input())
    expect(result.plan.order[0]).toMatch(/^core:/)
    expect(result.plan.order[1]).toMatch(/^verify:/)
    expect(result.plan.order[2]).toMatch(/^ui:/)
    expect(result.plan.order[3]).toMatch(/^consumers:/)
  })
})

describe('commit binding', () => {
  /* A full-length SHA is a format, not a binding. */
  it('rejects a commit that is not a full SHA', () => {
    const result = evaluateDryRun(input({ coreCommit: 'main' }))
    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/not a full 40-character SHA/)
  })

  it('rejects a Core checkout that is not on the candidate', () => {
    const result = evaluateDryRun(input({ coreHead: 'c'.repeat(40) }))
    expect(result.problems.join('\n')).toMatch(
      /the Core checkout is on c{40}, not the candidate a{40}/,
    )
  })

  it('rejects a UI checkout that is not on the candidate', () => {
    const result = evaluateDryRun(input({ uiHead: 'd'.repeat(40) }))
    expect(result.problems.join('\n')).toMatch(/the UI checkout is on d{40}/)
  })

  /*
   * The first version of this script made `--ui-root` optional and skipped the
   * Core-pin comparison when it was absent. An absent input made the check
   * disappear rather than fail.
   */
  it('requires the UI commit in strict mode', () => {
    const result = evaluateDryRun(input({ uiCommit: '' }))
    expect(result.problems.join('\n')).toMatch(
      /release-strict requires the UI candidate commit/,
    )
  })

  it('requires both checkout HEADs in strict mode', () => {
    const result = evaluateDryRun(
      input({ coreHead: undefined, uiHead: undefined }),
    )
    expect(result.problems.join('\n')).toMatch(
      /a SHA in a flag is not a binding/,
    )
  })

  /*
   * Diagnostic mode relaxes the *strictness* requirements — checkout HEADs and
   * a UI constraint must be present — but not the format checks. A commit that
   * is not a SHA is still a mistake in any mode.
   */
  it('does not require checkouts in diagnostic mode', () => {
    const result = evaluateDryRun(
      input({
        mode: 'diagnostic',
        coreHead: undefined,
        uiHead: undefined,
        uiCoreConstraints: [],
      }),
    )
    expect(result.problems).toEqual([])
  })

  it('still rejects a non-SHA commit in diagnostic mode', () => {
    const result = evaluateDryRun(
      input({ mode: 'diagnostic', uiCommit: '', uiCoreConstraints: [] }),
    )
    expect(result.problems.join('\n')).toMatch(/not a full 40-character SHA/)
  })
})

describe('versions', () => {
  it('rejects a non-RC version', () => {
    const result = evaluateDryRun(
      input({
        version: '0.2.0',
        coreVersions: Object.fromEntries(
          zeusFixedPackages.map(n => [n, '0.2.0']),
        ),
        uiCoreConstraints: [{ where: 'x', range: '0.2.0' }],
      }),
    )
    expect(result.problems.join('\n')).toMatch(/is not an RC version/)
  })

  it('rejects a plan whose Core version bump has not happened', () => {
    const result = evaluateDryRun(
      input({
        coreVersions: Object.fromEntries(
          zeusFixedPackages.map(n => [n, '0.1.1-beta.20']),
        ),
        uiCoreConstraints: [{ where: 'x', range: '0.1.1-beta.20' }],
      }),
    )
    expect(result.problems.join('\n')).toMatch(
      /Core manifests are at 0\.1\.1-beta\.20/,
    )
  })

  it('rejects a plan whose UI version bump has not happened', () => {
    const result = evaluateDryRun(
      input({ uiVersions: { '@zeus-web/button': '0.1.0-beta.35' } }),
    )
    expect(result.problems.join('\n')).toMatch(
      /UI manifests are at 0\.1\.0-beta\.35/,
    )
  })

  it('rejects Core packages that disagree', () => {
    const versions = { ...input().coreVersions } as Record<string, string>
    versions[zeusFixedPackages[0]!] = '0.2.0-rc.1'
    const result = evaluateDryRun(input({ coreVersions: versions }))
    expect(result.problems.join('\n')).toMatch(
      /Core published packages disagree on version/,
    )
  })

  it('rejects UI packages that disagree', () => {
    const result = evaluateDryRun(
      input({ uiVersions: { '@zeus-web/a': VERSION, '@zeus-web/b': '0.1.0' } }),
    )
    expect(result.problems.join('\n')).toMatch(
      /UI published packages disagree on version/,
    )
  })

  it('rejects a missing published package', () => {
    const versions = { ...input().coreVersions } as Record<string, string>
    delete versions[zeusFixedPackages[0]!]
    const result = evaluateDryRun(input({ coreVersions: versions }))
    expect(result.problems.join('\n')).toMatch(/has no manifest/)
  })
})

describe('UI constraints on Core', () => {
  /* Both fields bind; a peer range is as real as a dependency range. */
  it('rejects a dependency pin that does not match the cut', () => {
    const result = evaluateDryRun(
      input({
        uiCoreConstraints: [
          { where: 'zeus-compat dependencies', range: '0.1.1-beta.20' },
        ],
      }),
    )
    expect(result.problems.join('\n')).toMatch(
      /zeus-compat dependencies pins @zeus-js\/zeus at 0\.1\.1-beta\.20/,
    )
  })

  it('rejects a peer pin that does not match the cut', () => {
    const result = evaluateDryRun(
      input({
        uiCoreConstraints: [
          { where: 'button peerDependencies', range: '0.1.1-beta.20' },
        ],
      }),
    )
    expect(result.problems.join('\n')).toMatch(
      /button peerDependencies pins @zeus-js\/zeus/,
    )
  })

  it('requires at least one constraint in strict mode', () => {
    const result = evaluateDryRun(input({ uiCoreConstraints: [] }))
    expect(result.problems.join('\n')).toMatch(
      /requires at least one UI constraint on @zeus-js\/zeus/,
    )
  })

  it('rejects UI registry pins that disagree', () => {
    const result = evaluateDryRun(
      input({
        uiRegistryPins: { '@zeus-web/a': '1.0.0', '@zeus-web/b': '2.0.0' },
      }),
    )
    expect(result.problems.join('\n')).toMatch(
      /UI dependencies disagree on version/,
    )
  })
})

describe('registry state', () => {
  /*
   * "No conflict found" and "no query answered" look identical from here.
   * Treating an unanswered query as clean makes an outage look like a pass.
   */
  it('rejects when registry state is unknown', () => {
    const result = evaluateDryRun(
      input({ unknownRegistryState: ['@zeus-js/i18n (ETIMEDOUT)'] }),
    )
    expect(result.problems.join('\n')).toMatch(
      /an unanswered query is not an absent conflict/,
    )
  })

  it('rejects a version that already exists on the registry', () => {
    const result = evaluateDryRun(
      input({ versionCollisions: ['@zeus-js/zeus'] }),
    )
    expect(result.problems.join('\n')).toMatch(
      /already has 0\.2\.0-rc\.0 on the registry/,
    )
  })
})

describe('first publication', () => {
  /*
   * npm binds `latest` to a name's first published version whatever `--tag`
   * says. A stable first publish therefore makes the new package the default
   * install for everyone.
   */
  it('warns that a stable first publish would become latest', () => {
    const result = evaluateDryRun(
      input({
        version: '0.2.0',
        coreVersions: Object.fromEntries(
          zeusFixedPackages.map(n => [n, '0.2.0']),
        ),
        uiCoreConstraints: [{ where: 'x', range: '0.2.0' }],
        neverPublished: ['@zeus-js/i18n'],
      }),
    )
    expect(result.problems.join('\n')).toMatch(
      /@zeus-js\/i18n has never been published and 0\.2\.0 is not a prerelease/,
    )
  })

  it('reports each first-publish package separately with its risk', () => {
    const result = evaluateDryRun(
      input({
        neverPublished: [
          '@zeus-js/i18n',
          '@zeus-js/eslint-plugin',
          '@zeus-js/playground-engine',
        ],
      }),
    )
    expect(result.plan.firstPublish.map(risk => risk.name)).toEqual([
      '@zeus-js/i18n',
      '@zeus-js/eslint-plugin',
      '@zeus-js/playground-engine',
    ])
    for (const risk of result.plan.firstPublish) {
      expect(risk.wouldBindLatest).toBe(false)
      expect(risk.note).toMatch(/dist-tag must be set explicitly/)
    }
  })

  it('does not fail an RC first publish', () => {
    const result = evaluateDryRun(input({ neverPublished: ['@zeus-js/i18n'] }))
    expect(result.ok).toBe(true)
  })

  it('notices a non-published name in the never-published list', () => {
    const result = evaluateDryRun(
      input({ neverPublished: ['some-random-package'] }),
    )
    expect(result.warnings.join('\n')).toMatch(/is not a published package/)
  })
})
