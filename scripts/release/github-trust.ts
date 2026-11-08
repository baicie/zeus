/**
 * Trusted GitHub metadata for the RC approval boundary.
 *
 * The approval document is self-described JSON, so it is never trusted on its
 * own. The release workflow re-fetches the approval run from the GitHub API and
 * verifies that the run really was a protected `workflow_dispatch` of the RC
 * Approval workflow, at the Core commit, by the named approver, with the
 * `rc-approval` artifact digest recorded in the document. It additionally
 * verifies the GitHub artifact attestation, which is the cryptographic binding
 * between the artifact bytes and the approval workflow run.
 */
import { execFileSync } from 'node:child_process'

import type { TrustedApprovalRun } from './rc-approval'

export interface CommandResult {
  readonly status: number
  readonly stdout: string
  readonly stderr: string
}

export type CommandRunner = (
  file: string,
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv },
) => CommandResult

export const defaultCommandRunner: CommandRunner = (file, args, options) => {
  try {
    const result = execFileSync(file, [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(options?.env ? { env: options.env } : {}),
    })
    return { status: 0, stdout: result, stderr: '' }
  } catch (error) {
    const failure = error as {
      status?: number | null
      stdout?: string | Buffer
      stderr?: string | Buffer
    }
    return {
      status: typeof failure.status === 'number' ? failure.status : 1,
      stdout: String(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? ''),
    }
  }
}

export interface FetchApprovalRunInput {
  readonly repository: string
  readonly runId: string
  readonly run?: CommandRunner
}

export interface FetchApprovalRunResult {
  readonly metadata?: TrustedApprovalRun
  readonly errors: readonly string[]
}

export interface WorkflowRunSnapshot {
  readonly run: Record<string, unknown>
  readonly jobs: readonly unknown[]
  readonly artifacts: readonly unknown[]
}

export function fetchRunSnapshot(input: {
  readonly repository: string
  readonly runId: string
  readonly run?: CommandRunner
}): { snapshot?: WorkflowRunSnapshot; errors: readonly string[] } {
  const exec = input.run ?? defaultCommandRunner
  const errors: string[] = []
  const run = ghJson(
    exec,
    ['api', `repos/${input.repository}/actions/runs/${input.runId}`],
    'workflow run',
    errors,
  )
  const jobs = ghJson(
    exec,
    ['api', `repos/${input.repository}/actions/runs/${input.runId}/jobs`],
    'workflow run jobs',
    errors,
  )
  const artifacts = ghJson(
    exec,
    ['api', `repos/${input.repository}/actions/runs/${input.runId}/artifacts`],
    'workflow run artifacts',
    errors,
  )
  if (errors.length > 0 || !run) return { errors }
  return {
    errors: [],
    snapshot: {
      run,
      jobs: Array.isArray(jobs?.jobs) ? jobs.jobs : [],
      artifacts: Array.isArray(artifacts?.artifacts) ? artifacts.artifacts : [],
    },
  }
}

export function fetchApprovalRun(
  input: FetchApprovalRunInput,
): FetchApprovalRunResult {
  const snapshotResult = fetchRunSnapshot(input)
  const errors = [...snapshotResult.errors]
  if (!snapshotResult.snapshot) return { errors }
  const {
    run,
    jobs: jobList,
    artifacts: artifactList,
  } = snapshotResult.snapshot
  const environment = selectJobEnvironment(jobList)
  if (!environment) {
    errors.push('approval run has no job bound to a protected environment')
  }
  const artifact = selectArtifact(artifactList, 'rc-approval')
  const payloadArtifact = selectArtifact(artifactList, 'rc-approval-payload')

  return {
    errors,
    metadata: {
      repository: input.repository,
      runId: String(run.id ?? input.runId),
      runAttempt: String(run.run_attempt ?? '1'),
      workflowId: String(run.workflow_id ?? ''),
      workflowPath: String(run.path ?? ''),
      workflowName: String(run.name ?? ''),
      event: String(run.event ?? ''),
      status: String(run.status ?? ''),
      conclusion: String(run.conclusion ?? ''),
      headSha: String(run.head_sha ?? ''),
      actor: String(
        (isRecord(run.actor) && run.actor.login) ||
          (isRecord(run.triggering_actor) && run.triggering_actor.login) ||
          '',
      ),
      environment: environment ?? '',
      artifact,
      payloadArtifact,
    },
  }
}

export function selectJobEnvironment(
  jobs: readonly unknown[],
): string | undefined {
  for (const job of jobs) {
    if (!isRecord(job)) continue
    if (typeof job.environment === 'string' && job.environment.length > 0) {
      return job.environment
    }
  }
  return undefined
}

export function selectArtifact(
  artifacts: readonly unknown[],
  name: string,
): TrustedApprovalRun['artifact'] {
  for (const artifact of artifacts) {
    if (!isRecord(artifact)) continue
    if (artifact.name !== name) continue
    return {
      id: String(artifact.id ?? ''),
      name,
      digest:
        typeof artifact.digest === 'string' && artifact.digest.length > 0
          ? artifact.digest
          : '',
      expired: artifact.expired === true,
    }
  }
  return undefined
}

export interface AttestationInput {
  readonly repository: string
  readonly artifactPath: string
  readonly signerWorkflow: string
  readonly sourceDigest: string
  readonly run?: CommandRunner
}

export interface AttestationResult {
  readonly verified: boolean
  readonly signerWorkflow?: string
  readonly sourceDigest?: string
  readonly errors: readonly string[]
}

/**
 * `gh attestation verify` is the trust anchor: it checks the Sigstore bundle
 * produced by actions/attest-build-provenance against the repository's OIDC
 * identity, the signer workflow and the source digest.
 */
export function verifyAttestation(input: AttestationInput): AttestationResult {
  const exec = input.run ?? defaultCommandRunner
  const result = exec('gh', [
    'attestation',
    'verify',
    input.artifactPath,
    '--repo',
    input.repository,
    '--signer-workflow',
    `${input.repository}/${input.signerWorkflow}`,
    '--source-digest',
    input.sourceDigest,
    '--format',
    'json',
  ])
  if (result.status !== 0) {
    return {
      verified: false,
      errors: [
        `gh attestation verify failed: ${result.stderr.trim() || `exit ${result.status}`}`,
      ],
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout || '[]')
  } catch {
    return {
      verified: false,
      errors: ['gh attestation verify returned invalid JSON'],
    }
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed]
  if (entries.length === 0) {
    return { verified: false, errors: ['no attestation was returned'] }
  }
  return {
    verified: true,
    signerWorkflow: input.signerWorkflow,
    sourceDigest: input.sourceDigest,
    errors: [],
  }
}

export interface FetchFileInput {
  readonly repository: string
  readonly path: string
  readonly commit: string
  readonly run?: CommandRunner
}

/**
 * Reads a repository file at an immutable commit through the GitHub API.
 * Used to derive the paired UI version from the approved UI SHA instead of
 * trusting a value typed into the approval document.
 */
export function fetchFileAtCommit(input: FetchFileInput): {
  readonly content?: string
  readonly errors: readonly string[]
} {
  const exec = input.run ?? defaultCommandRunner
  const result = exec('gh', [
    'api',
    `repos/${input.repository}/contents/${input.path}?ref=${input.commit}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ])
  if (result.status !== 0) {
    return {
      errors: [
        `file ${input.path} at ${input.commit} cannot be fetched: ${
          result.stderr.trim() || `exit ${result.status}`
        }`,
      ],
    }
  }
  if (result.stdout.trim().length === 0) {
    return { errors: [`file ${input.path} at ${input.commit} is empty`] }
  }
  return { content: result.stdout, errors: [] }
}

export interface ActorPermissionInput {
  readonly repository: string
  readonly login: string
  readonly run?: CommandRunner
}

export function fetchActorPermission(input: ActorPermissionInput): {
  permission?: string
  errors: readonly string[]
} {
  const exec = input.run ?? defaultCommandRunner
  const errors: string[] = []
  const value = ghJson(
    exec,
    [
      'api',
      `repos/${input.repository}/collaborators/${input.login}/permission`,
    ],
    'approver permission',
    errors,
  )
  if (errors.length > 0 || !value) return { errors }
  const permission =
    typeof value.permission === 'string' ? value.permission : undefined
  if (!permission) errors.push('approver permission response has no permission')
  return { permission, errors }
}

function ghJson(
  exec: CommandRunner,
  args: readonly string[],
  label: string,
  errors: string[],
): Record<string, unknown> | undefined {
  const result = exec('gh', args)
  if (result.status !== 0) {
    errors.push(
      `${label} cannot be fetched: ${result.stderr.trim() || `exit ${result.status}`}`,
    )
    return undefined
  }
  try {
    const parsed = JSON.parse(result.stdout) as unknown
    if (!isRecord(parsed)) {
      errors.push(`${label} response is not a JSON object`)
      return undefined
    }
    return parsed
  } catch {
    errors.push(`${label} response is not valid JSON`)
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
