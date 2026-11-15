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

function input(overrides: Partial<DryRunInput> = {}): DryRunInput {
  const versions = Object.fromEntries(
    zeusFixedPackages.map(name => [name, '0.2.0-rc.0']),
  )
  return {
    root: '/tmp',
    coreCommit: CORE,
    uiCommit: UI,
    version: '0.2.0-rc.0',
    neverPublished: [],
    packageVersions: versions,
    uiPins: { '@zeus-web/button': '0.1.0-beta.34' },
    uiCorePin: '0.2.0-rc.0',
    ...overrides,
  }
}

describe('evaluateDryRun', () => {
  it('accepts a consistent plan', () => {
    const result = evaluateDryRun(input())
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.plan.distTag).toBe('rc')
  })

  /*
   * A plan that names a commit it did not resolve is a plan against whatever
   * `main` happens to be. Pinning is what makes the rehearsal reproducible.
   */
  it('rejects a commit that is not a full SHA', () => {
    const result = evaluateDryRun(input({ coreCommit: 'main' }))
    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/not a full 40-character SHA/)
  })

  it('rejects a non-RC version', () => {
    const versions = Object.fromEntries(
      zeusFixedPackages.map(name => [name, '0.2.0']),
    )
    const result = evaluateDryRun(
      input({
        version: '0.2.0',
        packageVersions: versions,
        uiCorePin: '0.2.0',
      }),
    )
    expect(result.problems.join('\n')).toMatch(/is not an RC version/)
  })

  /*
   * The plan says "cuts 0.2.0-rc.0". If the manifests still say beta.20, the
   * bump has not happened and the rehearsal is describing work it did not do.
   */
  it('rejects a plan whose version bump has not happened', () => {
    const result = evaluateDryRun(
      input({
        version: '0.2.0-rc.0',
        packageVersions: Object.fromEntries(
          zeusFixedPackages.map(n => [n, '0.1.1-beta.20']),
        ),
      }),
    )
    expect(result.problems.join('\n')).toMatch(
      /the version bump has not happened/,
    )
  })

  it('rejects packages that disagree on version', () => {
    const versions = Object.fromEntries(
      zeusFixedPackages.map(name => [name, '0.2.0-rc.0']),
    ) as Record<string, string>
    versions[zeusFixedPackages[0]!] = '0.2.0-rc.1'
    const result = evaluateDryRun(input({ packageVersions: versions }))
    expect(result.problems.join('\n')).toMatch(/disagree on version/)
  })

  it('rejects a missing published package', () => {
    const versions = { ...input().packageVersions } as Record<string, string>
    delete versions[zeusFixedPackages[0]!]
    const result = evaluateDryRun(input({ packageVersions: versions }))
    expect(result.problems.join('\n')).toMatch(/has no manifest/)
  })

  /*
   * npm binds `latest` to the first version published under a name, whatever
   * `--tag` says. A stable first publish therefore makes the new package the
   * default install for everyone, which is the pollution `repair:latest-tags`
   * exists to undo.
   */
  it('warns that a stable first publish would become latest', () => {
    const versions = Object.fromEntries(
      zeusFixedPackages.map(name => [name, '0.2.0']),
    )
    const result = evaluateDryRun(
      input({
        version: '0.2.0',
        packageVersions: versions,
        neverPublished: ['@zeus-js/i18n'],
        uiCorePin: '0.2.0',
      }),
    )
    expect(result.problems.join('\n')).toMatch(
      /@zeus-js\/i18n has never been published and 0\.2\.0 is not a prerelease/,
    )
  })

  it('lists first-publish packages in the plan', () => {
    const result = evaluateDryRun(
      input({ neverPublished: ['@zeus-js/i18n', 'not-a-zeus-package'] }),
    )
    expect(result.plan.firstPublish).toEqual(['@zeus-js/i18n'])
  })

  /*
   * Core is published before UI because UI pins Core exactly. A UI pin that
   * does not match the Core being cut cannot resolve from the registry.
   */
  it('rejects a UI whose Core pin does not match the cut', () => {
    const result = evaluateDryRun(input({ uiCorePin: '0.1.1-beta.20' }))
    expect(result.problems.join('\n')).toMatch(
      /UI pins @zeus-js\/zeus at 0\.1\.1-beta\.20, but Core is cutting 0\.2\.0-rc\.0/,
    )
  })

  it('rejects UI dependencies that disagree on version', () => {
    const result = evaluateDryRun(
      input({
        uiPins: {
          '@zeus-web/button': '0.1.0-beta.34',
          '@zeus-web/dialog': '0.1.0-beta.35',
        },
      }),
    )
    expect(result.problems.join('\n')).toMatch(/UI dependencies disagree/)
  })

  it('states the publish order', () => {
    const result = evaluateDryRun(input())
    expect(result.plan.order[0]).toMatch(/^core:/)
    expect(result.plan.order[1]).toMatch(/^ui:/)
    expect(result.plan.order[2]).toMatch(/^consumers:/)
  })
})
