/**
 * The release authorisation rules, against constructed inputs.
 *
 * Two kinds of case here, and the second kind is the point:
 *
 * - the happy path, so a correct release is authorised;
 * - every way a release should be refused, because a gate that only has a
 *   happy-path test is a gate nobody has tried to get past.
 *
 * Each refusal test names the clause it exercises. If one of them starts
 * passing, the invariant lost a clause.
 */
import { describe, expect, it } from 'vitest'

import {
  AUTHORIZATION_RULES,
  RELEASE_AUTHORIZATION_POLICY_VERSION,
  distTagForVersion,
  evaluateReleaseAuthorization,
  type AuthorizationInput,
  type SupportingRun,
} from '../release-authorization'

const CORE_SHA = 'a'.repeat(40)
const UI_SHA = 'b'.repeat(40)

function ciRun(overrides: Partial<SupportingRun> = {}): SupportingRun {
  return {
    workflowPath: '.github/workflows/ci.yml',
    runId: '1000',
    runAttempt: 1,
    headSha: CORE_SHA,
    conclusion: 'success',
    event: 'push',
    ...overrides,
  }
}

function nativeRun(overrides: Partial<SupportingRun> = {}): SupportingRun {
  return {
    workflowPath: '.github/workflows/compiler-native.yml',
    runId: '1001',
    runAttempt: 1,
    headSha: CORE_SHA,
    conclusion: 'success',
    event: 'workflow_call',
    ...overrides,
  }
}

/** Everything in order: a release that should publish. */
function authorized(
  overrides: Partial<AuthorizationInput> = {},
): AuthorizationInput {
  return {
    tagRefName: 'v0.2.0-rc.0',
    workflowSha: CORE_SHA,
    checkoutSha: CORE_SHA,
    version: '0.2.0-rc.0',
    isMainAncestor: true,
    coreVersions: {
      '@zeus-js/zeus': '0.2.0-rc.0',
      '@zeus-js/signal': '0.2.0-rc.0',
    },
    uiVersions: { '@zeus-web/button': '0.2.0-rc.0' },
    uiCommit: UI_SHA,
    supportingRuns: [ciRun(), nativeRun()],
    requiredWorkflows: [
      '.github/workflows/ci.yml',
      '.github/workflows/compiler-native.yml',
    ],
    sbomOk: true,
    tarballOk: true,
    registryReachable: true,
    registryCollisions: [],
    firstPublishPackages: [],
    distTag: 'rc',
    ...overrides,
  }
}

function verdictOf(
  input: AuthorizationInput,
  rule: string,
): string | undefined {
  return evaluateReleaseAuthorization(input).findings.find(
    finding => finding.rule === rule,
  )?.verdict
}

describe('a correct release', () => {
  it('is authorised, with the tag-immutability limitation recorded', () => {
    const result = evaluateReleaseAuthorization(authorized())
    /*
     * `POLICY_LIMITATION`, not `AUTHORIZED`: tag protection is repository
     * configuration no workflow token can read, and reporting it as verified
     * would be claiming a check that did not run. The release path treats this
     * one limitation as expected and every other as blocking.
     */
    expect(result.verdict).toBe('POLICY_LIMITATION')
    expect(result.policyVersion).toBe(RELEASE_AUTHORIZATION_POLICY_VERSION)
    expect(result.findings.filter(f => f.verdict === 'REFUSED')).toEqual([])
  })

  it('reports every rule, not only the failing ones', () => {
    const result = evaluateReleaseAuthorization(authorized())
    const rules = result.findings.map(f => f.rule)
    for (const rule of Object.values(AUTHORIZATION_RULES)) {
      expect(rules).toContain(rule)
    }
  })

  it('authorises a stable release under latest', () => {
    const result = evaluateReleaseAuthorization(
      authorized({
        tagRefName: 'v0.2.0',
        version: '0.2.0',
        coreVersions: { '@zeus-js/zeus': '0.2.0' },
        uiVersions: { '@zeus-web/button': '0.2.0' },
        distTag: 'latest',
      }),
    )
    expect(result.findings.filter(f => f.verdict === 'REFUSED')).toEqual([])
  })
})

/*
 * Negative cases. Each one is a release that must not publish.
 */
describe('refusals', () => {
  describe('the tag', () => {
    it('refuses a run with no tag ref', () => {
      const input = authorized({ tagRefName: undefined })
      expect(verdictOf(input, AUTHORIZATION_RULES.tagFormat)).toBe('REFUSED')
    })

    it('refuses a tag that does not name its version', () => {
      const input = authorized({ tagRefName: 'v0.2.0' })
      expect(verdictOf(input, AUTHORIZATION_RULES.tagFormat)).toBe('REFUSED')
    })

    it('refuses an unparseable version', () => {
      const input = authorized({
        version: 'not-a-version',
        tagRefName: 'vnot-a-version',
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.tagFormat)).toBe('REFUSED')
    })

    it('refuses an unsupported prerelease channel', () => {
      const input = authorized({
        version: '0.2.0-canary.1',
        tagRefName: 'v0.2.0-canary.1',
        coreVersions: { '@zeus-js/zeus': '0.2.0-canary.1' },
        uiVersions: { '@zeus-web/button': '0.2.0-canary.1' },
        distTag: 'canary',
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.distTag)).toBe('REFUSED')
    })
  })

  describe('the commit', () => {
    it('refuses when the checkout is not the tag target', () => {
      const input = authorized({ checkoutSha: 'c'.repeat(40) })
      expect(verdictOf(input, AUTHORIZATION_RULES.checkoutMatchesTag)).toBe(
        'REFUSED',
      )
    })

    it('refuses when GITHUB_SHA is missing', () => {
      const input = authorized({ workflowSha: undefined })
      expect(verdictOf(input, AUTHORIZATION_RULES.checkoutMatchesTag)).toBe(
        'REFUSED',
      )
    })

    it('refuses a tag that is not reachable from main', () => {
      const input = authorized({ isMainAncestor: false })
      expect(verdictOf(input, AUTHORIZATION_RULES.reachableFromMain)).toBe(
        'REFUSED',
      )
    })

    it('refuses when reachability was never computed', () => {
      const input = authorized({ isMainAncestor: undefined })
      expect(verdictOf(input, AUTHORIZATION_RULES.reachableFromMain)).toBe(
        'REFUSED',
      )
    })
  })

  describe('CI evidence', () => {
    it('refuses when no run is recorded', () => {
      const input = authorized({ supportingRuns: [] })
      expect(verdictOf(input, AUTHORIZATION_RULES.ciEvidence)).toBe('REFUSED')
    })

    it('refuses a run that passed on a different commit', () => {
      const input = authorized({
        supportingRuns: [ciRun({ headSha: 'd'.repeat(40) }), nativeRun()],
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.ciEvidence)).toBe('REFUSED')
    })

    it('refuses when a required workflow never ran', () => {
      const input = authorized({
        requiredWorkflows: [
          '.github/workflows/ci.yml',
          '.github/workflows/packed-consumers.yml',
        ],
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.ciEvidence)).toBe('REFUSED')
    })

    it('refuses when the newest attempt failed', () => {
      const input = authorized({
        supportingRuns: [
          ciRun({ runAttempt: 1, conclusion: 'success' }),
          ciRun({ runAttempt: 2, conclusion: 'failure' }),
          nativeRun(),
        ],
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.ciEvidence)).toBe('REFUSED')
    })

    it('accepts a failed attempt followed by a passing retry', () => {
      const input = authorized({
        supportingRuns: [
          ciRun({ runAttempt: 1, conclusion: 'failure' }),
          ciRun({ runAttempt: 2, conclusion: 'success' }),
          nativeRun(),
        ],
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.ciEvidence)).toBe(
        'AUTHORIZED',
      )
    })

    it('refuses when the release names no required workflows', () => {
      const input = authorized({ requiredWorkflows: [] })
      expect(verdictOf(input, AUTHORIZATION_RULES.ciEvidence)).toBe('REFUSED')
    })

    it('refuses when the native matrix is not recorded', () => {
      const input = authorized({ supportingRuns: [ciRun()] })
      expect(verdictOf(input, AUTHORIZATION_RULES.nativeEvidence)).toBe(
        'REFUSED',
      )
    })

    it('refuses when a native platform failed', () => {
      const input = authorized({
        supportingRuns: [
          ciRun(),
          nativeRun({ runId: '2001' }),
          nativeRun({ runId: '2002', conclusion: 'failure' }),
        ],
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.nativeEvidence)).toBe(
        'REFUSED',
      )
    })
  })

  describe('Core/UI pairing', () => {
    it('refuses when Core and UI disagree', () => {
      const input = authorized({
        uiVersions: { '@zeus-web/button': '0.1.0-beta.35' },
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.coreUiPairing)).toBe(
        'REFUSED',
      )
    })

    it('refuses a UI commit that is not a full SHA', () => {
      const input = authorized({ uiCommit: 'main' })
      expect(verdictOf(input, AUTHORIZATION_RULES.coreUiPairing)).toBe(
        'REFUSED',
      )
    })

    it('refuses when the UI commit is missing', () => {
      const input = authorized({ uiCommit: undefined })
      expect(verdictOf(input, AUTHORIZATION_RULES.coreUiPairing)).toBe(
        'REFUSED',
      )
    })

    it('refuses when Core packages disagree with each other', () => {
      const input = authorized({
        coreVersions: {
          '@zeus-js/zeus': '0.2.0-rc.0',
          '@zeus-js/signal': '0.1.1',
        },
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.coreUiPairing)).toBe(
        'REFUSED',
      )
    })
  })

  describe('the tree', () => {
    it('refuses when the manifests do not carry the tag version', () => {
      const input = authorized({
        coreVersions: { '@zeus-js/zeus': '0.1.1-beta.20' },
        uiVersions: { '@zeus-web/button': '0.1.1-beta.20' },
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.manifestVersion)).toBe(
        'REFUSED',
      )
    })

    it('refuses when no SBOM was produced', () => {
      const input = authorized({ sbomOk: undefined })
      expect(verdictOf(input, AUTHORIZATION_RULES.sbom)).toBe('REFUSED')
    })

    it('refuses an SBOM that does not validate', () => {
      const input = authorized({ sbomOk: false })
      expect(verdictOf(input, AUTHORIZATION_RULES.sbom)).toBe('REFUSED')
    })

    it('refuses when tarballs were not checked', () => {
      const input = authorized({ tarballOk: undefined })
      expect(verdictOf(input, AUTHORIZATION_RULES.tarballIntegrity)).toBe(
        'REFUSED',
      )
    })

    it('refuses a tarball that still carries workspace:', () => {
      const input = authorized({ tarballOk: false })
      expect(verdictOf(input, AUTHORIZATION_RULES.tarballIntegrity)).toBe(
        'REFUSED',
      )
    })
  })

  describe('the registry', () => {
    it('refuses when the registry could not be queried', () => {
      const input = authorized({ registryReachable: undefined })
      expect(verdictOf(input, AUTHORIZATION_RULES.registryState)).toBe(
        'REFUSED',
      )
    })

    it('refuses a version that already exists', () => {
      const input = authorized({ registryCollisions: ['@zeus-js/zeus'] })
      expect(verdictOf(input, AUTHORIZATION_RULES.registryState)).toBe(
        'REFUSED',
      )
    })
  })

  describe('dist-tags', () => {
    it('refuses when the workflow would publish under the wrong tag', () => {
      const input = authorized({ distTag: 'latest' })
      expect(verdictOf(input, AUTHORIZATION_RULES.distTag)).toBe('REFUSED')
    })

    it('refuses when a prerelease would bind latest through a first publish', () => {
      /*
       * npm binds `latest` to a package's first publish regardless of `--tag`.
       * This is the RC-07 case: the repair exists, but it should be planned
       * rather than discovered after the fact.
       */
      const input = authorized({ firstPublishPackages: ['@zeus-js/new-pkg'] })
      expect(verdictOf(input, AUTHORIZATION_RULES.distTag)).toBe('REFUSED')
    })

    it('allows a stable release to be a first publish', () => {
      const input = authorized({
        tagRefName: 'v0.2.0',
        version: '0.2.0',
        coreVersions: { '@zeus-js/zeus': '0.2.0' },
        uiVersions: { '@zeus-web/button': '0.2.0' },
        distTag: 'latest',
        firstPublishPackages: ['@zeus-js/new-pkg'],
      })
      expect(verdictOf(input, AUTHORIZATION_RULES.distTag)).toBe('AUTHORIZED')
    })
  })
})

describe('dist tag derivation', () => {
  it('maps each supported channel', () => {
    expect(distTagForVersion('0.2.0')).toBe('latest')
    expect(distTagForVersion('0.2.0-rc.0')).toBe('rc')
    expect(distTagForVersion('0.2.0-beta.20')).toBe('beta')
    expect(distTagForVersion('0.2.0-alpha.1')).toBe('alpha')
  })

  it('refuses an unmapped channel rather than defaulting to latest', () => {
    expect(distTagForVersion('0.2.0-canary.1')).toBeUndefined()
    expect(distTagForVersion('nonsense')).toBeUndefined()
  })
})

describe('verdict aggregation', () => {
  it('REFUSED outranks the tag-immutability limitation', () => {
    const result = evaluateReleaseAuthorization(
      authorized({ isMainAncestor: false }),
    )
    expect(result.verdict).toBe('REFUSED')
  })

  it('a single refusal blocks an otherwise perfect release', () => {
    const result = evaluateReleaseAuthorization(authorized({ sbomOk: false }))
    expect(result.verdict).toBe('REFUSED')
  })
})
