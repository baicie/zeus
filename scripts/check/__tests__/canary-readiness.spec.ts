import { describe, expect, it } from 'vitest'

import {
  evaluateCanaryReadiness,
  evaluateCanaryReport,
  isAllowedCanaryRewritePath,
  type CanaryReadinessInput,
  type CanaryRewritePolicy,
} from '../canary-readiness'

const commit = 'a'.repeat(40)
const pass = (evidence: string) => ({ status: 'pass' as const, evidence })
const policy: CanaryRewritePolicy = {
  exactPaths: [
    'package.json',
    'pnpm-lock.yaml',
    'packages/core/compiler-native/index.js',
    'packages/core/zeus/package.json',
  ],
  prefixes: ['.changeset/'],
  suffixes: ['CHANGELOG.md'],
}

const ready: CanaryReadinessInput = {
  sourceCommit: commit,
  headCommit: commit,
  expectedVersion: '0.1.1-canary.20261105.1.1.aaaaaaaa',
  actualVersion: '0.1.1-canary.20261105.1.1.aaaaaaaa',
  changedPaths: ['package.json', 'pnpm-lock.yaml'],
  rewritePolicy: policy,
  nativeBinaryPresent: true,
  packedConsumers: pass('packed consumer report passed for source HEAD'),
  createZeus: pass('create-zeus report passed for source HEAD'),
  secretFindings: 0,
  sbomComponents: 59,
  lockfileConsistent: true,
}

describe('evaluateCanaryReadiness', () => {
  it('passes a clean source with rewritten versions and current evidence', () => {
    const report = evaluateCanaryReadiness(ready)

    expect(report.decision).toBe('READY_FOR_CANARY_PUBLISH')
    expect(report.blockers).toEqual([])
    expect(report.checks.map(entry => entry.id)).not.toContain(
      'online-products',
    )
    expect(report.checks.map(entry => entry.id)).not.toContain(
      'release-approval',
    )
  })

  it('fails when the host native binary is missing', () => {
    const report = evaluateCanaryReadiness({
      ...ready,
      nativeBinaryPresent: false,
    })

    expect(report.decision).toBe('NOT_READY')
    expect(report.blockers).toEqual([
      'native-binaries: host native compiler binary is missing',
    ])
  })

  it('fails when packed consumer evidence is missing or stale', () => {
    expect(
      evaluateCanaryReadiness({
        ...ready,
        packedConsumers: {
          status: 'not_run',
          evidence: 'packed consumer report missing',
        },
      }).blockers,
    ).toEqual(['packed-consumers: packed consumer report missing'])

    expect(
      evaluateCanaryReadiness({
        ...ready,
        packedConsumers: {
          status: 'fail',
          evidence: `packed consumer report is bound to ${'b'.repeat(40)}, expected ${commit}`,
        },
      }).blockers,
    ).toEqual([
      `packed-consumers: packed consumer report is bound to ${'b'.repeat(40)}, expected ${commit}`,
    ])
  })

  it('fails a source edit disguised as a release rewrite', () => {
    const report = evaluateCanaryReadiness({
      ...ready,
      changedPaths: ['package.json', 'packages/core/zeus/src/index.ts'],
    })

    expect(report.decision).toBe('NOT_READY')
    expect(report.blockers).toEqual([
      'worktree: unexpected changed paths: packages/core/zeus/src/index.ts',
    ])
  })

  it('fails version, lockfile, secret and SBOM mismatches', () => {
    const report = evaluateCanaryReadiness({
      ...ready,
      actualVersion: '0.1.1-beta.20',
      lockfileConsistent: false,
      secretFindings: 2,
      sbomComponents: 0,
    })

    expect(report.blockers).toEqual([
      'version: package version 0.1.1-beta.20 does not match canary version 0.1.1-canary.20261105.1.1.aaaaaaaa',
      'secret-scan: 2 high-confidence secret findings',
      'sbom: 0 SBOM components',
      'lockfile: pnpm lockfile is not consistent with the rewritten packages',
    ])
  })

  it('fails a stale or invalid source commit', () => {
    expect(
      evaluateCanaryReadiness({
        ...ready,
        headCommit: 'b'.repeat(40),
      }).blockers,
    ).toEqual([
      `source-commit: HEAD ${'b'.repeat(40)} does not match source ${commit}`,
    ])

    expect(
      evaluateCanaryReadiness({ ...ready, sourceCommit: 'abc' }).blockers,
    ).toEqual(['source-commit: invalid source commit: abc'])
  })

  it('allows changesets and changelogs but rejects arbitrary package files', () => {
    expect(isAllowedCanaryRewritePath('.changeset/release.md', policy)).toBe(
      true,
    )
    expect(
      isAllowedCanaryRewritePath('packages/core/zeus/CHANGELOG.md', policy),
    ).toBe(true)
    expect(
      isAllowedCanaryRewritePath('packages/core/zeus/src/index.ts', policy),
    ).toBe(false)
  })
})

describe('evaluateCanaryReport', () => {
  it('requires a full sourceCommit and a passing report', () => {
    expect(
      evaluateCanaryReport(
        { sourceCommit: 'b'.repeat(40), passed: true },
        'packed consumer',
        commit,
      ),
    ).toEqual({
      status: 'fail',
      evidence: `packed consumer report is bound to ${'b'.repeat(40)}, expected ${commit}`,
    })

    expect(
      evaluateCanaryReport({ passed: true }, 'packed consumer', commit),
    ).toEqual({
      status: 'fail',
      evidence: 'packed consumer report is missing a full sourceCommit',
    })

    expect(
      evaluateCanaryReport(
        { sourceCommit: commit, results: [{ status: 'passed' }] },
        'packed consumer',
        commit,
      ),
    ).toEqual({
      status: 'pass',
      evidence: 'packed consumer report passed for source HEAD',
    })
  })
})
