import { describe, expect, it } from 'vitest'

import { collectCrossPlatformEvidence } from '../collect-cross-platform-evidence'
import {
  fetchApprovalRun,
  selectArtifact,
  selectJobEnvironment,
  verifyAttestation,
  type CommandRunner,
} from '../github-trust'
import { sha } from './rc-evidence-fixtures'

const CORE = 'a'.repeat(40)

function jobs() {
  return [
    {
      id: 1,
      name: 'lint-and-check',
      conclusion: 'success',
      completed_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'packed-consumers',
      conclusion: 'success',
      completed_at: new Date().toISOString(),
    },
    {
      id: 3,
      name: 'create-zeus-candidates (ubuntu-latest, x86_64-unknown-linux-gnu)',
      conclusion: 'success',
      completed_at: new Date().toISOString(),
    },
    {
      id: 4,
      name: 'create-zeus-candidates (windows-latest, x86_64-pc-windows-msvc)',
      conclusion: 'success',
      completed_at: new Date().toISOString(),
    },
  ]
}

function artifacts() {
  return [
    {
      id: 11,
      name: 'create-zeus-candidate-ubuntu-latest',
      digest: sha('linux'),
      expired: false,
    },
    {
      id: 12,
      name: 'create-zeus-candidate-windows-latest',
      digest: sha('windows'),
      expired: false,
    },
  ]
}

function collect(
  overrides: Partial<Parameters<typeof collectCrossPlatformEvidence>[0]> = {},
) {
  return collectCrossPlatformEvidence({
    commit: CORE,
    workflow: 'CI',
    workflowPath: '.github/workflows/ci.yml',
    workflowId: '100',
    runId: '200',
    runAttempt: '1',
    event: 'push',
    jobs: jobs(),
    artifacts: artifacts(),
    ...overrides,
  })
}

describe('collectCrossPlatformEvidence', () => {
  it('builds a digest-bound document from real run metadata', () => {
    const result = collect()
    expect(result.errors).toEqual([])
    expect(result.document?.platforms.linux.tested).toContain('create-zeus')
    expect(result.document?.platforms.win32.artifacts[0]?.digest).toBe(
      sha('windows'),
    )
  })

  it('rejects a Windows job that did not run', () => {
    const result = collect({
      jobs: jobs().filter(job => job.id !== 4),
    })
    expect(result.errors).toContain(
      'cross-platform win32 is missing the create-zeus-candidates job',
    )
  })

  it('rejects a failed job conclusion', () => {
    const result = collect({
      jobs: jobs().map(job =>
        job.id === 2 ? { ...job, conclusion: 'failure' } : job,
      ),
    })
    expect(result.errors).toContain(
      'cross-platform linux packed-consumers conclusion is failure',
    )
  })

  it('rejects an artifact without a digest', () => {
    const result = collect({
      artifacts: artifacts().map(artifact =>
        artifact.id === 12 ? { ...artifact, digest: '' } : artifact,
      ),
    })
    expect(result.errors).toContain(
      'cross-platform win32 artifact create-zeus-candidate-windows-latest has no sha256 digest',
    )
  })

  it('rejects an expired artifact', () => {
    const result = collect({
      artifacts: artifacts().map(artifact =>
        artifact.id === 11 ? { ...artifact, expired: true } : artifact,
      ),
    })
    expect(result.errors).toContain(
      'cross-platform linux artifact create-zeus-candidate-ubuntu-latest has expired',
    )
  })

  it('rejects a missing required test category', () => {
    const result = collect({
      jobs: jobs()
        .map(job =>
          job.id === 1
            ? { ...job, name: 'lint-and-check', conclusion: 'success' }
            : job,
        )
        .filter(job => job.id !== 3 && job.id !== 4),
    })
    expect(result.errors).toContain(
      'cross-platform linux does not cover the create-zeus test',
    )
  })
})

describe('github trust metadata', () => {
  const runner =
    (responses: Record<string, unknown>): CommandRunner =>
    (_file, args) => {
      const path = args.join(' ')
      const body = responses[path]
      if (body === undefined) {
        return { status: 1, stdout: '', stderr: 'not found' }
      }
      return { status: 0, stdout: JSON.stringify(body), stderr: '' }
    }

  const run = {
    id: 300,
    run_attempt: 1,
    workflow_id: 99,
    path: '.github/workflows/rc-approval.yml',
    name: 'RC Approval',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    head_sha: CORE,
    actor: { login: 'release-owner' },
  }

  it('fetches the run, environment and both artifacts', () => {
    const result = fetchApprovalRun({
      repository: 'baicie/zeus',
      runId: '300',
      run: runner({
        'api repos/baicie/zeus/actions/runs/300': run,
        'api repos/baicie/zeus/actions/runs/300/jobs': {
          jobs: [{ id: 1, environment: 'Release' }],
        },
        'api repos/baicie/zeus/actions/runs/300/artifacts': {
          artifacts: [
            {
              id: 31,
              name: 'rc-approval',
              digest: sha('envelope'),
              expired: false,
            },
            {
              id: 30,
              name: 'rc-approval-payload',
              digest: sha('payload'),
              expired: false,
            },
          ],
        },
      }),
    })
    expect(result.errors).toEqual([])
    expect(result.metadata?.environment).toBe('Release')
    expect(result.metadata?.artifact?.name).toBe('rc-approval')
    expect(result.metadata?.payloadArtifact?.name).toBe('rc-approval-payload')
  })

  it('fails closed when the GitHub API is unavailable', () => {
    const result = fetchApprovalRun({
      repository: 'baicie/zeus',
      runId: '300',
      run: runner({}),
    })
    expect(result.metadata).toBeUndefined()
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('fails closed when no job is bound to an environment', () => {
    const result = fetchApprovalRun({
      repository: 'baicie/zeus',
      runId: '300',
      run: runner({
        'api repos/baicie/zeus/actions/runs/300': run,
        'api repos/baicie/zeus/actions/runs/300/jobs': { jobs: [{ id: 1 }] },
        'api repos/baicie/zeus/actions/runs/300/artifacts': { artifacts: [] },
      }),
    })
    expect(result.errors).toContain(
      'approval run has no job bound to a protected environment',
    )
  })

  it('selects the exact artifact name and ignores lookalikes', () => {
    expect(
      selectArtifact(
        [
          { id: 1, name: 'rc-approval-evil', digest: sha('x'), expired: false },
          { id: 2, name: 'rc-approval', digest: sha('y'), expired: false },
        ],
        'rc-approval',
      )?.id,
    ).toBe('2')
    expect(selectArtifact([], 'rc-approval')).toBeUndefined()
  })

  it('selects the protected environment from a job', () => {
    expect(
      selectJobEnvironment([{ id: 1 }, { id: 2, environment: 'Release' }]),
    ).toBe('Release')
    expect(selectJobEnvironment([{ id: 1 }])).toBeUndefined()
  })

  it('fails attestation verification when gh exits non-zero', () => {
    const result = verifyAttestation({
      repository: 'baicie/zeus',
      artifactPath: 'approval.json',
      signerWorkflow: '.github/workflows/rc-approval.yml',
      sourceDigest: CORE,
      run: () => ({ status: 1, stdout: '', stderr: 'no attestation' }),
    })
    expect(result.verified).toBe(false)
    expect(result.errors[0]).toContain('gh attestation verify failed')
  })

  it('treats empty attestation output as unverified', () => {
    const result = verifyAttestation({
      repository: 'baicie/zeus',
      artifactPath: 'approval.json',
      signerWorkflow: '.github/workflows/rc-approval.yml',
      sourceDigest: CORE,
      run: () => ({ status: 0, stdout: '[]', stderr: '' }),
    })
    expect(result.verified).toBe(false)
    expect(result.errors).toContain('no attestation was returned')
  })
})
