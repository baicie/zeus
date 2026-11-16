import { describe, expect, it } from 'vitest'

import {
  APPROVER,
  CORE,
  UI,
  VERSION,
  approvalDocument,
  crossPlatformEvidence,
  rcEvidence,
  sha,
} from '../../release/__tests__/rc-evidence-fixtures'
import {
  RC_EVIDENCE_SCHEMA,
  REQUIRED_ONLINE_PRODUCTS,
  evaluateRcEvidence,
  evaluateRcReadiness,
  evaluateReportEvidence,
  evaluateSbom,
  readReleaseEnvironment,
  type RcReadinessInput,
} from '../rc-readiness'

import type { execFileSync } from 'node:child_process'

const pass = (evidence: string) => ({ status: 'pass' as const, evidence })

const pair = { coreCommit: CORE, uiCommit: UI }

const ready: RcReadinessInput = {
  commit: CORE,
  branch: 'codex/zeus-0.2.0-progress',
  dirty: false,
  frameworkVersion: VERSION,
  sbomComponents: 59,
  // A validated document: the `sbom` check now reflects validation, not a
  // count. A fixture without this reports `not_run`, which is the point.
  sbomValidation: { errors: [] },
  trackedFiles: 1400,
  secretFindings: 0,
  packedConsumers: pass('packed consumer report passed for current HEAD'),
  createZeus: pass('create-zeus report passed for current HEAD'),
  onlineProducts: pass(
    'four HTTPS product URLs and the deployment acceptance are bound to the current HEAD',
  ),
  crossPlatform: pass(
    'Linux and Windows evidence is bound to the current HEAD',
  ),
  releaseApproval: pass('release approval is bound to the current HEAD'),
  /*
   * A ready repository must have a protected Release environment. The fixture
   * says so explicitly: leaving it out now makes the document `not_run` for
   * that check, which is the behaviour under test elsewhere.
   */
  releaseEnvironment: {
    state: 'read',
    hasRequiredReviewers: true,
    reviewers: ['minato'],
    preventsSelfReview: true,
    adminsCanBypass: false,
    branchPolicy: 'custom',
    /*
     * The patterns, not just the mode. A `custom` policy whose contents were
     * not read is a POLICY_LIMITATION under the rules, not a pass — the
     * restriction exists and nobody has confirmed it covers releases.
     */
    deploymentPolicies: [{ name: 'v*', type: 'tag' }],
  },
  /*
   * The approval job lives in its own environment now, and the split moved it
   * out of the one whose protection was being verified. A ready repository has
   * to show that environment is protected too, or the self-approval check's
   * stated backstop is a claim about an unverified configuration.
   */
  approvalEnvironment: {
    state: 'read',
    hasRequiredReviewers: true,
    reviewers: ['minato'],
    preventsSelfReview: true,
    adminsCanBypass: false,
    branchPolicy: 'custom',
    deploymentPolicies: [{ name: 'main', type: 'branch' }],
  },
}

describe('evaluateRcReadiness', () => {
  it('passes only when every required evidence is present', () => {
    const report = evaluateRcReadiness(ready)

    expect(report.decision).toBe('READY_FOR_RELEASE_REVIEW')
    expect(report.readyForReview).toBe(true)
    expect(report.blockers).toEqual([])
    expect(report.checks).toHaveLength(10)
  })

  it('reports a dirty worktree and missing online evidence', () => {
    const report = evaluateRcReadiness({
      ...ready,
      dirty: true,
      onlineProducts: {
        status: 'not_run',
        evidence: 'evidence file missing: temp/release/rc-evidence.json',
      },
    })

    expect(report.decision).toBe('NOT_READY')
    expect(report.blockers).toEqual([
      'clean-worktree: working tree has uncommitted changes',
      'online-products: evidence file missing: temp/release/rc-evidence.json',
    ])
  })

  /*
   * The `Release` environment is named by `rc-approval.yml` and `release.yml`,
   * and `rc-approval.yml`'s own comment says it runs "behind the protected
   * `Release` environment (required reviewers)". Measured on this repository,
   * `protection_rules` is `[]`. Naming an environment protects nothing; the
   * protection is configuration, and it is absent.
   */
  it('fails when the Release environment requires no reviewer', () => {
    const report = evaluateRcReadiness({
      ...ready,
      releaseEnvironment: {
        state: 'read',
        hasRequiredReviewers: false,
        reviewers: [],
        preventsSelfReview: false,
        adminsCanBypass: true,
        branchPolicy: 'none',
      },
    })
    expect(report.blockers.join('\n')).toMatch(
      /release-environment: \[FAIL\] the Release environment requires no reviewer/,
    )
    expect(report.decision).toBe('NOT_READY')
  })

  it('reports the check as not_run when protection was not read', () => {
    const report = evaluateRcReadiness({
      ...ready,
      releaseEnvironment: undefined,
    })
    expect(report.blockers.join('\n')).toMatch(
      /release-environment: .*protection was not read/,
    )
  })

  it('passes when the environment names its reviewers', () => {
    const report = evaluateRcReadiness({
      ...ready,
      releaseEnvironment: {
        state: 'read',
        hasRequiredReviewers: true,
        reviewers: ['minato'],
        preventsSelfReview: true,
        adminsCanBypass: false,
        branchPolicy: 'custom',
        deploymentPolicies: [{ name: 'v*', type: 'tag' }],
      },
    })
    expect(report.checks).toContainEqual({
      id: 'release-environment',
      status: 'pass',
      evidence:
        'the Release environment requires approval from minato; the Release environment prevents self-review; repository admins cannot bypass the Release environment protection; every deployment pattern stays within refs/tags/v* ("v*" (tag)); "v*" admits refs under refs/tags/v…',
      policyVersion: 'zeus.release-policy/v2',
    })
  })

  /*
   * Required reviewers alone do not make a gate. If the person who triggered
   * the run can approve it, the "second person" is the first; if admins bypass
   * the rules, the gate binds only those who did not need it.
   */
  it('fails when the requester can approve their own run', () => {
    const report = evaluateRcReadiness({
      ...ready,
      releaseEnvironment: {
        state: 'read',
        hasRequiredReviewers: true,
        reviewers: ['minato'],
        preventsSelfReview: false,
        adminsCanBypass: false,
        branchPolicy: 'custom',
      },
    })
    expect(report.blockers.join('\n')).toMatch(
      /allows the requester to approve their own run/,
    )
  })

  /*
   * Every way of not knowing must stay `not_run`. Collapsing them into one
   * value — which the previous version did — makes a missing credential look
   * like a policy decision.
   */
  const unreadStates = [
    'not_configured',
    'unauthorized',
    'network_error',
    'tool_missing',
    'skipped',
  ] as const
  for (const state of unreadStates) {
    it(`reports ${state} as not_run, never pass`, () => {
      const report = evaluateRcReadiness({
        ...ready,
        releaseEnvironment: { state, detail: `probe said ${state}` },
      })
      const check = report.checks.find(
        entry => entry.id === 'release-environment',
      )
      expect(check?.status).toBe('not_run')
      expect(check?.evidence).toContain(state)
      expect(report.decision).toBe('NOT_READY')
    })
  }

  it('reports stale evidence and secrets independently', () => {
    const report = evaluateRcReadiness({
      ...ready,
      secretFindings: 2,
      sbomComponents: 0,
      // No validated document, so the check is `not_run` rather than a
      // count-based pass or fail. This is the behaviour change: an SBOM that
      // was never validated cannot be reported as either.
      sbomValidation: undefined,
      packedConsumers: {
        status: 'fail',
        evidence:
          'packed consumer report is bound to old-commit, expected abc123',
      },
    })

    expect(report.blockers).toEqual([
      'sbom: 0 components parsed, but the document was not validated',
      'secret-scan: 2 findings across 1400 tracked files',
      'packed-consumers: packed consumer report is bound to old-commit, expected abc123',
    ])
  })
})

describe('evaluateRcEvidence', () => {
  it('accepts four HTTPS products, bound cross-platform evidence and a structured approval', () => {
    const statuses = evaluateRcEvidence(rcEvidence(), CORE, pair, VERSION)

    expect(statuses).toEqual({
      onlineProducts: {
        status: 'pass',
        evidence:
          'four HTTPS product URLs and the deployment acceptance are bound to the current HEAD',
      },
      crossPlatform: {
        status: 'pass',
        evidence: 'Linux and Windows evidence is bound to the current HEAD',
      },
      releaseApproval: {
        status: 'pass',
        evidence:
          'release approval is bound to the current HEAD, the evidence digest and a verified artifact attestation',
      },
    })
  })

  it('rejects a deployment that is not accepted or whose digests drift', () => {
    const document = rcEvidence()
    const notAccepted = evaluateRcEvidence(
      {
        ...document,
        deployment: {
          ...(document.deployment as Record<string, unknown>),
          decision: 'NOT_ACCEPTED',
        },
      },
      CORE,
      pair,
    )
    expect(notAccepted.onlineProducts.status).toBe('fail')
    expect(notAccepted.onlineProducts.evidence).toContain(
      'deployment.decision must be ONLINE_ACCEPTED',
    )

    const deployment = document.deployment as Record<string, unknown>
    const drifted = evaluateRcEvidence(
      {
        ...document,
        deployment: {
          ...deployment,
          products: (deployment.products as Array<Record<string, unknown>>).map(
            (entry, index) =>
              index === 0 ? { ...entry, imageDigest: sha('z') } : entry,
          ),
        },
      },
      CORE,
      pair,
    )
    expect(drifted.onlineProducts.evidence).toContain(
      'deployment product webc-studio imageDigest mismatch',
    )
  })

  it('rejects HTTP URLs, missing products and stale commits', () => {
    const document = rcEvidence()
    const products = document.products as Array<Record<string, unknown>>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        products: [
          { ...products[0], url: 'http://webc-studio.example.test' },
          ...products.slice(2),
        ],
        crossPlatform: {
          ...(document.crossPlatform as Record<string, unknown>),
          commit: 'old-commit',
        },
      },
      CORE,
      pair,
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'products[0].url must be an HTTPS URL',
    )
    expect(statuses.onlineProducts.evidence).toContain(
      'products is missing native-lab',
    )
    expect(statuses.crossPlatform.status).toBe('fail')
    expect(statuses.crossPlatform.evidence).toContain(
      'cross-platform commit does not match the Core commit',
    )
  })

  it('binds the AI Workbench to the UI commit and core products to Core', () => {
    const document = rcEvidence()
    const products = document.products as Array<Record<string, unknown>>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        products: products.map(product =>
          product.product === 'ai-workbench'
            ? { ...product, commit: CORE }
            : product,
        ),
      },
      CORE,
      pair,
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'products[3].commit does not match the UI commit',
    )
  })

  it('requires a CI release pair to bind the UI commit', () => {
    const statuses = evaluateRcEvidence(rcEvidence(), CORE)

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'release pair provenance missing (temp/release/pair.json)',
    )
  })

  it('rejects a schema or top-level commit mismatch for every evidence group', () => {
    const statuses = evaluateRcEvidence(
      { ...rcEvidence(), schema: 'zeus.rc-evidence/old' },
      'different-commit',
      pair,
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      `schema must be ${RC_EVIDENCE_SCHEMA}`,
    )
    expect(statuses.onlineProducts.evidence).toContain(
      'top-level commit does not match current HEAD',
    )
    expect(statuses.crossPlatform.status).toBe('fail')
    expect(statuses.releaseApproval.status).toBe('fail')
  })

  it('rejects an approval version that does not match the release version', () => {
    const statuses = evaluateRcEvidence(rcEvidence(), CORE, pair, '0.2.0')

    expect(statuses.releaseApproval.status).toBe('fail')
    expect(statuses.releaseApproval.evidence).toContain(
      `evidence version ${VERSION} does not match 0.2.0`,
    )
  })

  it('rejects NOT_RUN and forged approver strings', () => {
    const document = rcEvidence()
    const approval = document.releaseApproval as Record<string, unknown>
    for (const approver of ['NOT_RUN', 'PENDING', 'release-owner', '']) {
      const statuses = evaluateRcEvidence(
        {
          ...document,
          releaseApproval: { ...approval, approver },
        },
        CORE,
        pair,
      )
      expect(statuses.releaseApproval.status).toBe('fail')
      expect(statuses.releaseApproval.evidence).toContain(
        'release approval approver must be an object',
      )
    }
  })

  it('rejects an approver that is not on the authorised list', () => {
    const document = rcEvidence()
    const approval = document.releaseApproval as Record<string, unknown>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        releaseApproval: {
          ...approval,
          approver: { login: 'attacker', id: 7, permission: 'admin' },
        },
      },
      CORE,
      pair,
    )

    expect(statuses.releaseApproval.status).toBe('fail')
    expect(statuses.releaseApproval.evidence).toContain(
      'release approval approver attacker is not authorised',
    )
    expect(statuses.releaseApproval.evidence).toContain(
      'approval run actor does not match the approver identity',
    )
  })

  it('rejects an approval bound to a different Core or UI commit', () => {
    const document = rcEvidence()
    const approval = document.releaseApproval as Record<string, unknown>
    for (const [field, value, message] of [
      [
        'coreCommit',
        'c'.repeat(40),
        'release approval coreCommit does not match the Core commit',
      ],
      [
        'uiCommit',
        'c'.repeat(40),
        'release approval uiCommit does not match the UI commit',
      ],
    ] as const) {
      const statuses = evaluateRcEvidence(
        {
          ...document,
          releaseApproval: { ...approval, [field]: value },
        },
        CORE,
        pair,
      )
      expect(statuses.releaseApproval.status).toBe('fail')
      expect(statuses.releaseApproval.evidence).toContain(message)
    }
  })

  it('rejects an approval run from another workflow, run id or environment', () => {
    const document = rcEvidence()
    const run = document.approvalRun as Record<string, unknown>
    const cases: Array<[Record<string, unknown>, string]> = [
      [
        { ...run, workflowPath: '.github/workflows/release.yml' },
        'approval run was not produced by the RC Approval workflow',
      ],
      [
        { ...run, runId: '999' },
        'approval run id does not match the downloaded artifact run',
      ],
      [
        { ...run, environment: 'staging' },
        'approval run is not protected by the RC Approval environment',
      ],
      [
        { ...run, conclusion: 'failure' },
        'approval run conclusion is not success',
      ],
      [
        { ...run, headSha: 'd'.repeat(40) },
        'approval run headSha does not match the Core commit',
      ],
    ]
    for (const [approvalRun, message] of cases) {
      const statuses = evaluateRcEvidence(
        { ...document, approvalRun },
        CORE,
        pair,
      )
      expect(statuses.releaseApproval.status).toBe('fail')
      expect(statuses.releaseApproval.evidence).toContain(message)
    }
  })

  it('rejects a modified artifact digest and a missing attestation', () => {
    const document = rcEvidence()
    const run = document.approvalRun as Record<string, unknown>
    const payloadArtifact = run.payloadArtifact as Record<string, unknown>
    const tampered = evaluateRcEvidence(
      {
        ...document,
        approvalRun: {
          ...run,
          payloadArtifact: { ...payloadArtifact, digest: sha('tampered') },
        },
      },
      CORE,
      pair,
    )
    expect(tampered.releaseApproval.status).toBe('fail')
    expect(tampered.releaseApproval.evidence).toContain(
      'approval payload artifact digest does not match the approval document',
    )

    const unverified = evaluateRcEvidence(
      {
        ...document,
        approvalAttestation: {
          verified: false,
          errors: ['signature mismatch'],
        },
      },
      CORE,
      pair,
    )
    expect(unverified.releaseApproval.status).toBe('fail')
    expect(unverified.releaseApproval.evidence).toContain(
      'release approval artifact attestation did not verify',
    )
  })

  it('rejects an approval whose evidence digest differs from the evidence', () => {
    const document = rcEvidence()
    const approval = document.releaseApproval as Record<string, unknown>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        releaseApproval: { ...approval, evidenceDigest: sha('other-evidence') },
      },
      CORE,
      pair,
    )

    expect(statuses.releaseApproval.status).toBe('fail')
    expect(statuses.releaseApproval.evidence).toContain(
      'release approval evidenceDigest does not match the evidence',
    )
  })

  it('rejects a local Stage 2 report masquerading as online evidence', () => {
    const document = rcEvidence()
    const deployment = document.deployment as Record<string, unknown>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        deployment: { ...deployment, decision: 'LOCAL_ACCEPTED' },
      },
      CORE,
      pair,
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'deployment.decision must be ONLINE_ACCEPTED',
    )
  })

  it('rejects Linux PASS with Windows NOT_RUN', () => {
    const document = rcEvidence()
    const crossPlatform = document.crossPlatform as Record<string, unknown>
    const platforms = crossPlatform.platforms as Record<string, unknown>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        crossPlatform: {
          ...crossPlatform,
          platforms: {
            ...platforms,
            win32: {
              ...(platforms.win32 as Record<string, unknown>),
              status: 'NOT_RUN',
            },
          },
        },
      },
      CORE,
      pair,
    )

    expect(statuses.crossPlatform.status).toBe('fail')
    expect(statuses.crossPlatform.evidence).toContain(
      'cross-platform win32 status must be PASS',
    )
  })

  it('rejects empty or foreign cross-platform evidence', () => {
    const document = rcEvidence()
    for (const crossPlatform of [
      { platforms: ['linux', 'win32'], report: 'NOT_RUN', commit: CORE },
      {
        ...crossPlatformEvidence(),
        workflowPath: '.github/workflows/release.yml',
      },
    ]) {
      const statuses = evaluateRcEvidence(
        { ...document, crossPlatform },
        CORE,
        pair,
      )
      expect(statuses.crossPlatform.status).toBe('fail')
    }
  })

  it('exposes the authorised approvers through the assembled policy', () => {
    const document = rcEvidence() as Record<string, unknown>
    expect(document.approvalPolicy).toEqual({
      authorizedApprovers: [APPROVER],
    })
    const approval = approvalDocument()
    expect(approval.version).toBe(VERSION)
    expect((document.products as unknown[]).length).toBe(
      REQUIRED_ONLINE_PRODUCTS.length,
    )
  })
})

describe('evaluateReportEvidence', () => {
  it('requires a report sourceCommit bound to the current HEAD', () => {
    expect(
      evaluateReportEvidence(
        { passed: true, sourceCommit: 'old-commit' },
        'create-zeus',
        CORE,
      ),
    ).toEqual({
      status: 'fail',
      evidence: `create-zeus report is bound to old-commit, expected ${CORE}`,
    })

    expect(
      evaluateReportEvidence({ passed: true }, 'create-zeus', CORE),
    ).toEqual({
      status: 'fail',
      evidence: 'create-zeus report is missing sourceCommit',
    })
  })
})

/**
 * Counting components is not validating an SBOM.
 *
 * `sbom` passed on `components.length > 0`. A document with a single invented
 * component, no dependency graph, and a version nobody published satisfied it —
 * so the gate reported the same `pass` as a fully validated document.
 *
 * The strict evaluation below checks what the field is supposed to mean: the
 * document parses, every component has a unique `bom-ref`, the graph is
 * present and internally consistent, and the component set matches the
 * lockfile.
 */
describe('SBOM validation beyond a component count', () => {
  const validSbom = (): Record<string, unknown> => ({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: { timestamp: '1970-01-01T00:00:00.000Z', tools: [] },
    components: [
      {
        type: 'library',
        name: '@zeus-js/zeus',
        version: '0.1.1-beta.20',
        'bom-ref': '@zeus-js/zeus@0.1.1-beta.20',
      },
      {
        type: 'library',
        name: 'picocolors',
        version: '1.1.1',
        'bom-ref': 'picocolors@1.1.1',
      },
    ],
    dependencies: [
      {
        ref: '@zeus-js/zeus@0.1.1-beta.20',
        dependsOn: ['picocolors@1.1.1'],
      },
      { ref: 'picocolors@1.1.1', dependsOn: [] },
    ],
  })

  /*
   * `requiredBy` is what makes the edge checks meaningful: without it the
   * expected edge map is empty, every ownership comparison is skipped, and a
   * document with a deleted or moved edge passes.
   */
  const expected = {
    workspace: [{ name: '@zeus-js/zeus', version: '0.1.1-beta.20' }],
    runtime: [
      { name: 'picocolors', version: '1.1.1', requiredBy: ['@zeus-js/zeus'] },
    ],
  }

  it('accepts a well formed document', () => {
    const result = evaluateSbom(validSbom(), expected)
    expect(result.errors).toEqual([])
  })

  it('rejects a document with one invented component', () => {
    const forged = validSbom()
    forged.components = [
      {
        type: 'library',
        name: 'fake',
        version: '1.0.0',
        'bom-ref': 'fake@1.0.0',
      },
    ]
    const result = evaluateSbom(forged, expected)
    expect(result.errors.join('\n')).toMatch(/lockfile|missing/)
  })

  it('rejects an empty dependency graph', () => {
    const doc = validSbom()
    doc.dependencies = []
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(/dependenc/i)
  })

  it('rejects a wrong package version', () => {
    const doc = validSbom()
    ;(doc.components as { version: string }[])[0]!.version = '9.9.9'
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(
      /version|missing/,
    )
  })

  it('rejects duplicate bom-refs', () => {
    const doc = validSbom()
    ;(doc.components as unknown[]).push({
      type: 'library',
      name: 'picocolors',
      version: '1.1.1',
      'bom-ref': 'picocolors@1.1.1',
    })
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(/duplicate/)
  })

  it('rejects a document that is not an object', () => {
    expect(evaluateSbom('not an object', expected).errors).not.toEqual([])
  })

  /*
   * The official schema, not an impression of it.
   *
   * This function used to compare `bomFormat` and `specVersion` strings and
   * call that validation, while `check:sbom` compiled the real CycloneDX 1.5
   * schema in a test. A document `check:sbom` rejected as malformed was a pass
   * here. Both now go through `validateCycloneDxSchema`.
   */
  it('rejects a document the official schema rejects', () => {
    const doc = validSbom()
    // `type` is required by the schema for every component.
    delete (doc.components as Record<string, unknown>[])[0]!.type
    const errors = evaluateSbom(doc, expected).errors.join('\n')
    expect(errors).toMatch(/CycloneDX 1\.5 schema/)
  })

  it('rejects an unknown top-level property', () => {
    const doc = validSbom()
    doc['zeus:runtimeDependencies'] = []
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(
      /CycloneDX 1\.5 schema/,
    )
  })

  /* C2 — name alone is not enough; the version must be the one we built. */
  it('rejects a workspace component at the wrong version', () => {
    const doc = validSbom()
    const component = (doc.components as Record<string, unknown>[])[0]!
    component.version = '9.9.9'
    component['bom-ref'] = '@zeus-js/zeus@9.9.9'
    ;(doc.dependencies as Record<string, unknown>[])[0]!.ref =
      '@zeus-js/zeus@9.9.9'
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(
      /recorded at 9\.9\.9, expected 0\.1\.1-beta\.20/,
    )
  })

  it('rejects a forged extra workspace package', () => {
    const doc = validSbom()
    ;(doc.components as unknown[]).push({
      type: 'library',
      name: '@zeus-js/invented',
      version: '1.0.0',
      'bom-ref': '@zeus-js/invented@1.0.0',
    })
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(
      /not implied by the lockfile/,
    )
  })

  /* C3 — the graph must match the lockfile, not merely be well formed. */
  it('rejects a deleted dependency edge', () => {
    const doc = validSbom()
    ;(doc.dependencies as Record<string, unknown>[])[0]!.dependsOn = []
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(
      /missing an edge|does not imply/,
    )
  })

  it('rejects an edge moved to the wrong package', () => {
    const doc = validSbom()
    const dependencies = doc.dependencies as Record<string, unknown>[]
    dependencies[0]!.dependsOn = []
    dependencies[1]!.dependsOn = ['@zeus-js/zeus@0.1.1-beta.20']
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(
      /missing an edge|does not imply|edge to/,
    )
  })

  it('rejects an invented dependency edge', () => {
    /*
     * A workspace package depends on `picocolors`. Claiming it also depends on
     * `@zeus-js/zeus` is a real change in what installs what — the lockfile
     * says otherwise, so the extra edge must be reported. (Adding the edge to
     * the third-party node instead would prove nothing: ownership is only
     * checked for workspace packages.)
     */
    const doc = validSbom()
    ;(doc.components as unknown[]).push({
      type: 'library',
      name: 'left-pad',
      version: '1.3.0',
      'bom-ref': 'left-pad@1.3.0',
    })
    const deps = doc.dependencies as Record<string, unknown>[]
    deps[0]!.dependsOn = ['picocolors@1.1.1', 'left-pad@1.3.0']
    deps.push({ ref: 'left-pad@1.3.0', dependsOn: [] })
    const errors = evaluateSbom(doc, expected).errors.join('\n')
    /* The invented component trips the lockfile comparison first. */
    expect(errors).toMatch(/not implied by the lockfile|does not imply|edge to/)
  })

  it('rejects a duplicate dependency node', () => {
    const doc = validSbom()
    ;(doc.dependencies as unknown[]).push({
      ref: 'picocolors@1.1.1',
      dependsOn: [],
    })
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(
      /duplicate|dependenc/i,
    )
  })

  it('rejects a dangling reference', () => {
    const doc = validSbom()
    ;(doc.dependencies as Record<string, unknown>[])[0]!.dependsOn = [
      'ghost@0.0.0',
    ]
    expect(evaluateSbom(doc, expected).errors.join('\n')).toMatch(
      /dangling|missing component/,
    )
  })
})

/**
 * The probe itself, not just what the readiness gate does with its result.
 *
 * `readReleaseEnvironment` shells out to `gh`. The previous version wrapped
 * that in a bare `catch { return undefined }`, so a missing token, a 403, a
 * timeout and a genuinely unprotected environment all looked identical. These
 * tests drive the real function with an injected `gh` and assert each case is
 * distinguishable.
 */
describe('readReleaseEnvironment', () => {
  const tokenEnv = { GH_TOKEN: 'test-token' } as NodeJS.ProcessEnv

  function ghReturning(body: unknown) {
    return (() => JSON.stringify(body)) as unknown as typeof execFileSync
  }

  function ghFailing(message: string, code?: string) {
    return (() => {
      const error = new Error(message) as Error & {
        stderr?: string
        code?: string
      }
      error.stderr = message
      if (code) error.code = code
      throw error
    }) as unknown as typeof execFileSync
  }

  it('reads required reviewers, self-review and bypass from the API', () => {
    const probe = readReleaseEnvironment(
      tokenEnv,
      ghReturning({
        can_admins_bypass: true,
        protection_rules: [
          {
            type: 'required_reviewers',
            prevent_self_review: true,
            reviewers: [{ reviewer: { login: 'minato' } }],
          },
          { type: 'branch_policy' },
        ],
        deployment_branch_policy: { custom_branch_policies: true },
      }),
    )
    expect(probe).toMatchObject({
      state: 'read',
      hasRequiredReviewers: true,
      reviewers: ['minato'],
      preventsSelfReview: true,
      adminsCanBypass: true,
      branchPolicy: 'custom',
    })
  })

  it('treats a missing prevent_self_review as allowing self-review', () => {
    const probe = readReleaseEnvironment(
      tokenEnv,
      ghReturning({
        protection_rules: [
          {
            type: 'required_reviewers',
            reviewers: [{ reviewer: { login: 'minato' } }],
          },
        ],
      }),
    )
    expect(probe.state).toBe('read')
    if (probe.state !== 'read') return
    expect(probe.preventsSelfReview).toBe(false)
  })

  it('distinguishes an unprotected environment from an unreadable one', () => {
    const probe = readReleaseEnvironment(
      tokenEnv,
      ghReturning({ protection_rules: [] }),
    )
    expect(probe).toMatchObject({
      state: 'read',
      hasRequiredReviewers: false,
    })
  })

  it('reports a missing token as unauthorized, not as missing protection', () => {
    const probe = readReleaseEnvironment({} as NodeJS.ProcessEnv)
    expect(probe.state).toBe('unauthorized')
    expect('GH_TOKEN' in probe || JSON.stringify(probe)).toMatch(/GH_TOKEN/)
  })

  it('reports a 404 as not_configured', () => {
    const probe = readReleaseEnvironment(
      tokenEnv,
      ghFailing('gh: Not Found (HTTP 404)'),
    )
    expect(probe.state).toBe('not_configured')
  })

  it('reports a 403 as unauthorized', () => {
    const probe = readReleaseEnvironment(
      tokenEnv,
      ghFailing('gh: Forbidden (HTTP 403)'),
    )
    expect(probe.state).toBe('unauthorized')
  })

  it('reports a missing gh binary as tool_missing', () => {
    const probe = readReleaseEnvironment(
      tokenEnv,
      ghFailing('spawn gh ENOENT', 'ENOENT'),
    )
    expect(probe.state).toBe('tool_missing')
  })

  it('reports an unparseable body as a network error', () => {
    const probe = readReleaseEnvironment(
      tokenEnv,
      (() => '<html>gateway timeout</html>') as unknown as typeof execFileSync,
    )
    expect(probe.state).toBe('network_error')
  })

  it('passes the token to gh explicitly rather than inheriting it', () => {
    let seen: NodeJS.ProcessEnv | undefined
    const run = ((
      _cmd: string,
      _args: string[],
      options: { env: NodeJS.ProcessEnv },
    ) => {
      seen = options.env
      return JSON.stringify({ protection_rules: [] })
    }) as unknown as typeof execFileSync
    readReleaseEnvironment(tokenEnv, run)
    expect(seen?.GH_TOKEN).toBe('test-token')
  })

  it('honours an explicit skip without pretending protection exists', () => {
    const probe = readReleaseEnvironment(
      { ZEUS_SKIP_ENVIRONMENT_PROBE: '1' } as NodeJS.ProcessEnv,
      ghReturning({ protection_rules: [] }),
    )
    expect(probe.state).toBe('skipped')
  })
})
