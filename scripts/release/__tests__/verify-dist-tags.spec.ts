import { zeusFixedPackages, zeusNativePackages } from '../../release.config'
import {
  createVerifierWithRetry,
  getDistTagPolicyErrors,
  getProvenanceStatementErrors,
  RetryableRegistryError,
  settleRegistryBatch,
  runRegistryRetries,
} from '../verify-dist-tags'

import type { BundleVerifier } from 'sigstore'

const version = '0.1.1-canary.20260813.200.1.b919e736'

function validTags(): Map<string, Record<string, string>> {
  return new Map(
    zeusFixedPackages.map(pkg => [
      pkg,
      {
        canary: version,
        ...(zeusNativePackages.includes(pkg) ? {} : { latest: '0.1.0' }),
      },
    ]),
  )
}

describe('npm dist-tag policy', () => {
  it('accepts one fixed-group canary with provenance and no native latest', () => {
    expect(
      getDistTagPolicyErrors({
        expectedVersion: version,
        expectedTag: 'canary',
        expectedSha: 'b919e7365230205d415a1f056359996ee20dffc6',
        requireProvenance: true,
        tagsByPackage: validTags(),
        provenanceByPackage: new Map(zeusFixedPackages.map(pkg => [pkg, true])),
      }),
    ).toEqual([])
  })

  it('rejects a fixed package whose shared tag was rolled back', () => {
    const tags = validTags()
    tags.set('@zeus-js/compiler', {
      canary: '0.1.1-canary.20260812.105.1.aaffcfa2',
      latest: '0.1.0',
    })

    expect(
      getDistTagPolicyErrors({
        expectedVersion: version,
        expectedTag: 'canary',
        requireProvenance: false,
        tagsByPackage: tags,
        provenanceByPackage: new Map(),
      }),
    ).toContain(
      '@zeus-js/compiler: canary points to 0.1.1-canary.20260812.105.1.aaffcfa2, expected 0.1.1-canary.20260813.200.1.b919e736',
    )
  })

  it('rejects prerelease versions on native latest', () => {
    const tags = validTags()
    tags.set('@zeus-js/compiler-native', {
      canary: version,
      latest: version,
    })

    expect(
      getDistTagPolicyErrors({
        expectedVersion: version,
        expectedTag: 'canary',
        requireProvenance: false,
        tagsByPackage: tags,
        provenanceByPackage: new Map(),
      }),
    ).toContain(
      `@zeus-js/compiler-native: latest must not point to prerelease ${version}`,
    )
  })

  it('validates the signed repository, workflow, ref, commit and subject', () => {
    const { expected, statement } = validProvenanceStatement()

    expect(getProvenanceStatementErrors(statement, expected)).toEqual([])
  })

  it.each([
    ['repository', 'workflow repository does not match'],
    ['workflow', 'workflow path does not match'],
    ['ref', 'workflow ref does not match'],
    ['commit', 'git commit does not match'],
    ['subject', 'subject does not match'],
    ['digest', 'subject sha512 does not match'],
  ])('rejects a mismatched signed %s', (_field, expectedError) => {
    const { expected, statement } = validProvenanceStatement()
    const changed = structuredClone(statement)

    switch (_field) {
      case 'repository':
        changed.predicate.buildDefinition.externalParameters.workflow.repository =
          'https://github.com/example/zeus'
        break
      case 'workflow':
        changed.predicate.buildDefinition.externalParameters.workflow.path =
          '.github/workflows/other.yml'
        break
      case 'ref':
        changed.predicate.buildDefinition.externalParameters.workflow.ref =
          'refs/heads/feature'
        break
      case 'commit':
        changed.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit =
          'aaffcfa2'.padEnd(40, '0')
        break
      case 'subject':
        changed.subject[0].name = `pkg:npm/%40zeus-js/shared@${version}`
        break
      case 'digest':
        changed.subject[0].digest.sha512 = 'cd'.repeat(64)
        break
    }

    expect(getProvenanceStatementErrors(changed, expected)).toEqual(
      expect.arrayContaining([expect.stringContaining(expectedError)]),
    )
  })
})

describe('registry retry policy', () => {
  it('retries a transient TUF verifier initialization failure', async () => {
    let attempts = 0
    const waits: number[] = []
    const verifier: BundleVerifier = { verify: () => undefined as never }

    await expect(
      createVerifierWithRetry(
        async () => {
          attempts += 1
          if (attempts === 1) {
            throw Object.assign(new Error('error refreshing TUF metadata'), {
              code: 'TUF_REFRESH_METADATA_ERROR',
              cause: Object.assign(new Error('connection reset'), {
                code: 'ECONNRESET',
              }),
            })
          }
          return verifier
        },
        [0, 1],
        async delay => {
          waits.push(delay)
        },
      ),
    ).resolves.toBe(verifier)

    expect(attempts).toBe(2)
    expect(waits).toEqual([1])
  })

  it('prefers a permanent failure after an earlier transient failure', async () => {
    const policyError = new Error('invalid provenance policy')
    let rejectPolicy!: (reason: unknown) => void
    const policyFailure = new Promise<never>((_resolve, reject) => {
      rejectPolicy = reject
    })
    const batch = settleRegistryBatch([
      Promise.reject(new RetryableRegistryError('HTTP 503')),
      policyFailure,
    ])

    await Promise.resolve()
    rejectPolicy(policyError)

    await expect(batch).rejects.toBe(policyError)
  })

  it('retries only explicitly transient registry failures', async () => {
    let attempts = 0

    await expect(
      runRegistryRetries(
        async () => {
          attempts += 1
          if (attempts < 3) throw new RetryableRegistryError('HTTP 503')
          return 'ok'
        },
        [0, 1, 1],
        async () => {},
      ),
    ).resolves.toBe('ok')

    expect(attempts).toBe(3)
  })

  it('fails policy and parsing errors immediately', async () => {
    let attempts = 0

    await expect(
      runRegistryRetries(
        async () => {
          attempts += 1
          throw new SyntaxError('invalid registry JSON')
        },
        [0, 1, 1],
        async () => {},
      ),
    ).rejects.toThrow('invalid registry JSON')

    expect(attempts).toBe(1)
  })
})

function validProvenanceStatement(): {
  expected: {
    packageName: string
    version: string
    integrity: string
    repository: string
    workflowPath: string
    ref: string
    sha: string
  }
  statement: {
    _type: string
    subject: Array<{ name: string; digest: { sha512: string } }>
    predicateType: string
    predicate: {
      buildDefinition: {
        buildType: string
        externalParameters: {
          workflow: { repository: string; path: string; ref: string }
        }
        resolvedDependencies: Array<{
          uri: string
          digest: { gitCommit: string }
        }>
      }
      runDetails: { builder: { id: string } }
    }
  }
} {
  const expected = {
    packageName: '@zeus-js/compiler',
    version,
    integrity: `sha512-${Buffer.from('ab'.repeat(64), 'hex').toString('base64')}`,
    repository: 'https://github.com/baicie/zeus',
    workflowPath: '.github/workflows/release-canary.yml',
    ref: 'refs/heads/main',
    sha: 'b919e7365230205d415a1f056359996ee20dffc6',
  }
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [
      {
        name: `pkg:npm/%40zeus-js/compiler@${version}`,
        digest: { sha512: 'ab'.repeat(64) },
      },
    ],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType:
          'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: {
          workflow: {
            repository: expected.repository,
            path: expected.workflowPath,
            ref: expected.ref,
          },
        },
        resolvedDependencies: [
          {
            uri: `git+${expected.repository}@${expected.ref}`,
            digest: { gitCommit: expected.sha },
          },
        ],
      },
      runDetails: {
        builder: {
          id: 'https://github.com/actions/runner/github-hosted',
        },
      },
    },
  }

  return { expected, statement }
}
